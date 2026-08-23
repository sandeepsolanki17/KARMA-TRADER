import type { PoolClient } from 'pg';
import type { AccountStatus, BrokerId, Client } from '@karma/types';
import { pool } from '../../db/pool.js';

interface ClientRow {
  id: string;
  user_id: string | null;
  clerk_user_id: string | null;
  name: string;
  phone: string | null;
  preferred_broker: BrokerId;
  status: AccountStatus;
  invited_email: string;
  invited_at: string;
  joined_at: string | null;
  created_at: string;
  last_seen_at: string | null;
}

function toClient(row: ClientRow): Client {
  return {
    id: row.id,
    clerkUserId: row.clerk_user_id ?? '',
    name: row.name,
    phone: row.phone,
    preferredBroker: row.preferred_broker,
    status: row.status,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
  };
}

export async function findClientByUserId(userId: string): Promise<Client | null> {
  const { rows } = await pool.query<ClientRow>('SELECT * FROM clients WHERE user_id = $1', [userId]);
  return rows[0] ? toClient(rows[0]) : null;
}

export async function findClientById(clientId: string): Promise<Client | null> {
  const { rows } = await pool.query<ClientRow>('SELECT * FROM clients WHERE id = $1', [clientId]);
  return rows[0] ? toClient(rows[0]) : null;
}

export async function findClientByInvitedEmail(email: string): Promise<Client | null> {
  const { rows } = await pool.query<ClientRow>('SELECT * FROM clients WHERE lower(invited_email) = lower($1)', [
    email,
  ]);
  return rows[0] ? toClient(rows[0]) : null;
}

export interface ClientListItem extends Client {
  joinedAt: string | null;
  invitedEmail: string;
}

export async function listClients(): Promise<ClientListItem[]> {
  const { rows } = await pool.query<ClientRow>('SELECT * FROM clients ORDER BY created_at DESC');
  return rows.map((row) => ({ ...toClient(row), joinedAt: row.joined_at, invitedEmail: row.invited_email }));
}

export interface InsertClientParams {
  name: string;
  phone: string | null;
  preferredBroker: BrokerId;
  invitedEmail: string;
}

/** Creates the client record at invite time — user_id/clerk_user_id are filled in later by the Clerk webhook. */
export async function insertPendingClient(params: InsertClientParams, dbClient: PoolClient): Promise<Client> {
  const { rows } = await dbClient.query<ClientRow>(
    `INSERT INTO clients (name, phone, preferred_broker, invited_email)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [params.name, params.phone, params.preferredBroker, params.invitedEmail],
  );
  return toClient(rows[0]!);
}

/** Called by the Clerk `user.created` webhook once the invited person signs up. */
export async function linkClerkIdentity(
  clientId: string,
  userId: string,
  clerkUserId: string,
  dbClient: PoolClient,
): Promise<Client> {
  const { rows } = await dbClient.query<ClientRow>(
    `UPDATE clients SET user_id = $2, clerk_user_id = $3, joined_at = now() WHERE id = $1 RETURNING *`,
    [clientId, userId, clerkUserId],
  );
  return toClient(rows[0]!);
}

export async function setClientStatus(clientId: string, status: AccountStatus): Promise<Client | null> {
  const { rows } = await pool.query<ClientRow>('UPDATE clients SET status = $2 WHERE id = $1 RETURNING *', [
    clientId,
    status,
  ]);
  return rows[0] ? toClient(rows[0]) : null;
}

/** Client ids with ACTIVE status AND a currently-active membership — the live recipient pool. */
export async function listEligibleRecipientClientIds(): Promise<string[]> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT c.id FROM clients c
     JOIN memberships m ON m.client_id = c.id
     WHERE c.status = 'ACTIVE' AND m.status = 'ACTIVE' AND m.expires_at > now()`,
  );
  return rows.map((r) => r.id);
}
