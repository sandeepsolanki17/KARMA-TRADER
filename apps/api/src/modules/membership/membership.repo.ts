import type { PoolClient } from 'pg';
import type { Membership, MembershipStatus } from '@karma/types';
import { pool } from '../../db/pool.js';

interface MembershipRow {
  id: string;
  client_id: string;
  status: MembershipStatus;
  starts_at: string;
  expires_at: string;
  last_payment_marked_at: string | null;
  last_payment_marked_by: string | null;
  created_at: string;
  updated_at: string;
}

function toMembership(row: MembershipRow): Membership {
  return {
    id: row.id,
    clientId: row.client_id,
    status: row.status,
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    lastPaymentMarkedAt: row.last_payment_marked_at,
    lastPaymentMarkedByAdminId: row.last_payment_marked_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getMembershipForClient(clientId: string): Promise<Membership | null> {
  const { rows } = await pool.query<MembershipRow>('SELECT * FROM memberships WHERE client_id = $1', [clientId]);
  return rows[0] ? toMembership(rows[0]) : null;
}

/** Creates the initial membership row for a newly onboarded client, expired by default until extended. */
export async function createInitialMembership(clientId: string, dbClient: PoolClient): Promise<Membership> {
  const { rows } = await dbClient.query<MembershipRow>(
    `INSERT INTO memberships (client_id, status, starts_at, expires_at)
     VALUES ($1, 'EXPIRED', now(), now())
     RETURNING *`,
    [clientId],
  );
  return toMembership(rows[0]!);
}

/**
 * Extends membership by `days` from the LATER of (now, current expiry) so
 * renewing early doesn't waste remaining paid time. Optionally stamps a
 * payment-received marker in the same update.
 */
export async function extendMembership(
  clientId: string,
  days: number,
  markPaymentReceived: boolean,
  adminId: string,
): Promise<Membership> {
  const { rows } = await pool.query<MembershipRow>(
    `UPDATE memberships
     SET expires_at = GREATEST(expires_at, now()) + ($2 || ' days')::interval,
         status = 'ACTIVE',
         updated_at = now(),
         last_payment_marked_at = CASE WHEN $3 THEN now() ELSE last_payment_marked_at END,
         last_payment_marked_by = CASE WHEN $3 THEN $4 ELSE last_payment_marked_by END
     WHERE client_id = $1
     RETURNING *`,
    [clientId, days, markPaymentReceived, adminId],
  );
  if (!rows[0]) throw new Error(`No membership row for client ${clientId}`);
  return toMembership(rows[0]);
}

export async function markPayment(clientId: string, adminId: string): Promise<Membership> {
  const { rows } = await pool.query<MembershipRow>(
    `UPDATE memberships
     SET last_payment_marked_at = now(), last_payment_marked_by = $2, updated_at = now()
     WHERE client_id = $1
     RETURNING *`,
    [clientId, adminId],
  );
  if (!rows[0]) throw new Error(`No membership row for client ${clientId}`);
  return toMembership(rows[0]);
}

export async function cancelMembership(clientId: string): Promise<Membership> {
  const { rows } = await pool.query<MembershipRow>(
    `UPDATE memberships SET status = 'CANCELLED', updated_at = now() WHERE client_id = $1 RETURNING *`,
    [clientId],
  );
  if (!rows[0]) throw new Error(`No membership row for client ${clientId}`);
  return toMembership(rows[0]);
}

/** Sweeps memberships whose expiry has passed into EXPIRED status. Run on a schedule (see notifications/scheduler). */
export async function sweepExpiredMemberships(): Promise<number> {
  const { rowCount } = await pool.query(
    `UPDATE memberships SET status = 'EXPIRED', updated_at = now()
     WHERE status = 'ACTIVE' AND expires_at <= now()`,
  );
  return rowCount ?? 0;
}
