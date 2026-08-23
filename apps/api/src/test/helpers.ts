import { pool } from '../db/pool.js';

/** Wipes all domain tables between tests. Order matters for FK constraints. */
export async function resetDb(): Promise<void> {
  await pool.query(`
    TRUNCATE TABLE
      notification_jobs,
      signal_recipients,
      signal_events,
      signals,
      devices,
      memberships,
      audit_events,
      clients,
      users
    RESTART IDENTITY CASCADE
  `);
}

export async function createTestAdmin(clerkUserId = `admin_${Date.now()}_${Math.random().toString(36).slice(2)}`) {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (clerk_user_id, role, status) VALUES ($1, 'ADMIN', 'ACTIVE') RETURNING id`,
    [clerkUserId],
  );
  return rows[0]!.id;
}

/** Creates a fully joined, active-membership client ready to receive signals. */
export async function createTestClient(opts: {
  clerkUserId?: string;
  name?: string;
  membershipActive?: boolean;
} = {}) {
  const clerkUserId = opts.clerkUserId ?? `client_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const email = `${clerkUserId}@example.test`;

  const { rows: userRows } = await pool.query<{ id: string }>(
    `INSERT INTO users (clerk_user_id, role, status) VALUES ($1, 'CLIENT', 'ACTIVE') RETURNING id`,
    [clerkUserId],
  );
  const userId = userRows[0]!.id;

  const { rows: clientRows } = await pool.query<{ id: string }>(
    `INSERT INTO clients (user_id, clerk_user_id, name, preferred_broker, invited_email, joined_at)
     VALUES ($1, $2, $3, 'ANGEL_ONE', $4, now()) RETURNING id`,
    [userId, clerkUserId, opts.name ?? 'Test Client', email],
  );
  const clientId = clientRows[0]!.id;

  const expiresAt = opts.membershipActive === false ? 'now() - interval \'1 day\'' : 'now() + interval \'30 days\'';
  const status = opts.membershipActive === false ? 'EXPIRED' : 'ACTIVE';
  await pool.query(
    `INSERT INTO memberships (client_id, status, starts_at, expires_at) VALUES ($1, $2, now(), ${expiresAt})`,
    [clientId, status],
  );

  return { userId, clientId, clerkUserId };
}

export async function registerTestDevice(clientId: string, tokenSuffix = Math.random().toString(36).slice(2)) {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO devices (client_id, expo_push_token, platform, last_active_at)
     VALUES ($1, $2, 'ANDROID', now()) RETURNING id`,
    [clientId, `ExponentPushToken[test-${tokenSuffix}]`],
  );
  return rows[0]!.id;
}
