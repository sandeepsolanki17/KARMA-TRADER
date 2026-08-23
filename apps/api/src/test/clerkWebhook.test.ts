import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

/**
 * Mocks ONLY svix's signature verification (Clerk's webhook delivery is
 * cryptographically signed via svix — that's a well-tested third-party
 * library, not our code). Everything after that — parsing the event,
 * finding the pending client by invited email, creating the users row,
 * linking clerk_user_id — is real code against real Postgres.
 */
let nextVerifyResult: unknown;

vi.mock('svix', () => ({
  Webhook: vi.fn().mockImplementation(() => ({
    verify: vi.fn(() => nextVerifyResult),
  })),
}));

process.env.CLERK_SECRET_KEY = 'sk_test_fake_configured_for_webhook_tests_only';

const { pool } = await import('../db/pool.js');
const { closeQueues } = await import('../modules/notifications/queue.js');
const { buildApp } = await import('../app.js');
const { resetDb } = await import('./helpers.js');

function svixHeaders() {
  return {
    'svix-id': 'msg_test',
    'svix-timestamp': String(Date.now()),
    'svix-signature': 'v1,fake',
  };
}

describe('Clerk webhook — user.created linking logic', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await closeQueues();
    await pool.end();
  });

  beforeEach(async () => {
    await resetDb();
  });

  it('links a user.created event to a pending client invite by email, case-insensitively', async () => {
    await pool.query(
      `INSERT INTO clients (name, phone, preferred_broker, invited_email) VALUES ('Test Client', NULL, 'ANGEL_ONE', 'Invitee@Example.com')`,
    );

    nextVerifyResult = {
      type: 'user.created',
      data: {
        id: 'clerk_new_client_1',
        email_addresses: [{ id: 'ea_1', email_address: 'invitee@example.com' }],
        primary_email_address_id: 'ea_1',
      },
    };

    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/clerk',
      headers: svixHeaders(),
      payload: { type: 'user.created' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, linked: 'client' });

    const { rows } = await pool.query(
      `SELECT clerk_user_id, joined_at FROM clients WHERE lower(invited_email) = 'invitee@example.com'`,
    );
    expect(rows[0]!.clerk_user_id).toBe('clerk_new_client_1');
    expect(rows[0]!.joined_at).not.toBeNull();

    const { rows: userRows } = await pool.query(`SELECT role, status FROM users WHERE clerk_user_id = 'clerk_new_client_1'`);
    expect(userRows[0]).toMatchObject({ role: 'CLIENT', status: 'ACTIVE' });
  });

  it('does NOT auto-provision an account for an email with no matching invite (prevents unauthorized self-signup)', async () => {
    nextVerifyResult = {
      type: 'user.created',
      data: {
        id: 'clerk_stranger_1',
        email_addresses: [{ id: 'ea_1', email_address: 'stranger@example.com' }],
        primary_email_address_id: 'ea_1',
      },
    };

    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/clerk',
      headers: svixHeaders(),
      payload: { type: 'user.created' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, ignored: 'no_matching_invite' });

    const { rows } = await pool.query(`SELECT * FROM users WHERE clerk_user_id = 'clerk_stranger_1'`);
    expect(rows).toHaveLength(0);
  });

  it('links an ADMIN-metadata user.created event to a new admin user row, not the client table', async () => {
    nextVerifyResult = {
      type: 'user.created',
      data: {
        id: 'clerk_new_admin_1',
        email_addresses: [{ id: 'ea_1', email_address: 'admin@example.com' }],
        primary_email_address_id: 'ea_1',
        public_metadata: { role: 'ADMIN' },
      },
    };

    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/clerk',
      headers: svixHeaders(),
      payload: { type: 'user.created' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, linked: 'admin' });

    const { rows } = await pool.query(`SELECT role, status FROM users WHERE clerk_user_id = 'clerk_new_admin_1'`);
    expect(rows[0]).toMatchObject({ role: 'ADMIN', status: 'ACTIVE' });
  });

  it('is idempotent: replaying the same event for an already-linked identity does not error or duplicate', async () => {
    await pool.query(`INSERT INTO users (clerk_user_id, role, status) VALUES ('clerk_existing_1', 'CLIENT', 'ACTIVE')`);

    nextVerifyResult = {
      type: 'user.created',
      data: {
        id: 'clerk_existing_1',
        email_addresses: [{ id: 'ea_1', email_address: 'existing@example.com' }],
        primary_email_address_id: 'ea_1',
      },
    };

    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/clerk',
      headers: svixHeaders(),
      payload: { type: 'user.created' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, alreadyLinked: true });

    const { rows } = await pool.query(`SELECT * FROM users WHERE clerk_user_id = 'clerk_existing_1'`);
    expect(rows).toHaveLength(1); // not duplicated
  });

  it('ignores non-user.created event types without error', async () => {
    nextVerifyResult = { type: 'session.created', data: { id: 'sess_1' } };

    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/clerk',
      headers: svixHeaders(),
      payload: { type: 'session.created' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, ignored: 'session.created' });
  });
});
