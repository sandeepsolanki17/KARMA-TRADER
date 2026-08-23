import type { PoolClient } from 'pg';
import { pool } from '../db/pool.js';
import type { AccountStatus, User, UserRole } from '@karma/types';

interface UserRow {
  id: string;
  clerk_user_id: string;
  role: UserRole;
  status: AccountStatus;
  org_id: string | null;
  created_at: string;
  last_seen_at: string | null;
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    clerkUserId: row.clerk_user_id,
    role: row.role,
    status: row.status,
    orgId: row.org_id,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
  };
}

export async function findUserByClerkId(clerkUserId: string): Promise<User | null> {
  const { rows } = await pool.query<UserRow>('SELECT * FROM users WHERE clerk_user_id = $1', [clerkUserId]);
  return rows[0] ? toUser(rows[0]) : null;
}

export async function createAdminUser(clerkUserId: string): Promise<User> {
  const { rows } = await pool.query<UserRow>(
    `INSERT INTO users (clerk_user_id, role, status) VALUES ($1, 'ADMIN', 'ACTIVE') RETURNING *`,
    [clerkUserId],
  );
  return toUser(rows[0]!);
}

export async function createClientUser(clerkUserId: string, client: PoolClient = pool as never): Promise<User> {
  const { rows } = await client.query<UserRow>(
    `INSERT INTO users (clerk_user_id, role, status) VALUES ($1, 'CLIENT', 'ACTIVE') RETURNING *`,
    [clerkUserId],
  );
  return toUser(rows[0]!);
}

export async function touchLastSeen(userId: string): Promise<void> {
  await pool.query('UPDATE users SET last_seen_at = now() WHERE id = $1', [userId]);
}
