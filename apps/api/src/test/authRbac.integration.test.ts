import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

/**
 * IMPORTANT — what this file does and does not prove.
 *
 * `verifyToken` from @clerk/backend is Clerk's own cryptographic session
 * verification — that's their well-tested library, not our code, and we
 * cannot exercise it for real without a live Clerk secret key + network
 * access, neither of which this environment has. This file mocks ONLY that
 * one function, with a fixed map of fake token -> Clerk user id.
 *
 * Everything downstream of that mock is 100% real: real Fastify routing,
 * real Postgres-backed role lookup (auth/rbac.ts), real membership-expiry
 * gating, real recipient-snapshot-based client isolation, real IDOR checks
 * on live rows. This proves OUR authorization logic is correct for any
 * identity Clerk verifies — it does not and cannot prove Clerk's token
 * verification itself works, or that a real browser sign-in flow works.
 */

const FAKE_TOKENS: Record<string, string> = {
  'token-admin': 'clerk_admin_fake_1',
  'token-client-a': 'clerk_client_fake_a',
  'token-client-b': 'clerk_client_fake_b',
  'token-client-expired': 'clerk_client_fake_expired',
};

vi.mock('@clerk/backend', () => ({
  verifyToken: vi.fn(async (token: string) => {
    const sub = FAKE_TOKENS[token];
    if (!sub) throw new Error('invalid token');
    return { sub } as any;
  }),
  createClerkClient: vi.fn(() => ({
    invitations: { createInvitation: vi.fn(async () => ({})) },
  })),
}));

// CLERK_SECRET_KEY must look "real" (not contain REPLACE_ME/placeholder) for
// isClerkConfigured to be true and verifyClerkSession to actually attempt
// verification instead of short-circuiting to 500 server_misconfigured —
// see apps/api/src/config/env.ts. This is still not a real key; it only
// flips that one boolean, and the mock above intercepts the actual call.
process.env.CLERK_SECRET_KEY = 'sk_test_fake_configured_for_rbac_tests_only';

const { pool } = await import('../db/pool.js');
const { closeQueues } = await import('../modules/notifications/queue.js');
const { buildApp } = await import('../app.js');
const { resetDb } = await import('./helpers.js');

describe('RBAC + client isolation with mocked Clerk verification', () => {
  let app: FastifyInstance;
  let adminUserId: string;
  let clientA: { userId: string; clientId: string };
  let clientB: { userId: string; clientId: string };
  let clientExpired: { userId: string; clientId: string };

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

    const { rows: adminRows } = await pool.query<{ id: string }>(
      `INSERT INTO users (clerk_user_id, role, status) VALUES ($1, 'ADMIN', 'ACTIVE') RETURNING id`,
      ['clerk_admin_fake_1'],
    );
    adminUserId = adminRows[0]!.id;

    clientA = await seedClient('clerk_client_fake_a', true);
    clientB = await seedClient('clerk_client_fake_b', true);
    clientExpired = await seedClient('clerk_client_fake_expired', false);
  });

  async function seedClient(clerkUserId: string, membershipActive: boolean) {
    const { rows: userRows } = await pool.query<{ id: string }>(
      `INSERT INTO users (clerk_user_id, role, status) VALUES ($1, 'CLIENT', 'ACTIVE') RETURNING id`,
      [clerkUserId],
    );
    const userId = userRows[0]!.id;
    const { rows: clientRows } = await pool.query<{ id: string }>(
      `INSERT INTO clients (user_id, clerk_user_id, name, preferred_broker, invited_email, joined_at)
       VALUES ($1, $2, $3, 'ANGEL_ONE', $4, now()) RETURNING id`,
      [userId, clerkUserId, `Test ${clerkUserId}`, `${clerkUserId}@example.test`],
    );
    const clientId = clientRows[0]!.id;
    const expiresAt = membershipActive ? "now() + interval '30 days'" : "now() - interval '1 day'";
    const status = membershipActive ? 'ACTIVE' : 'EXPIRED';
    await pool.query(
      `INSERT INTO memberships (client_id, status, starts_at, expires_at) VALUES ($1, $2, now(), ${expiresAt})`,
      [clientId, status],
    );
    return { userId, clientId };
  }

  function authHeader(token: keyof typeof FAKE_TOKENS) {
    return { authorization: `Bearer ${token}` };
  }

  // ---------- Admin authentication + role authorization ----------

  it('a valid admin session token grants access to admin routes', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin/clients', headers: authHeader('token-admin') });
    expect(res.statusCode).toBe(200);
    expect(res.json().clients).toHaveLength(3); // clientA, clientB, clientExpired
  });

  it('a valid CLIENT session token is rejected from admin routes (role check enforced server-side)', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin/clients', headers: authHeader('token-client-a') });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('forbidden');
  });

  it('an unrecognized bearer token is rejected as unauthorized, not silently allowed', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/clients',
      headers: { authorization: 'Bearer this-token-does-not-exist-anywhere' },
    });
    expect(res.statusCode).toBe(401);
  });

  // ---------- Client authentication + entitlement ----------

  it('a valid client session token maps to their own client record via /client/me', async () => {
    const res = await app.inject({ method: 'GET', url: '/client/me', headers: authHeader('token-client-a') });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.client.id).toBe(clientA.clientId);
    expect(body.membership.status).toBe('ACTIVE');
  });

  it('an ADMIN session token is rejected from client-only routes', async () => {
    const res = await app.inject({ method: 'GET', url: '/client/me', headers: authHeader('token-admin') });
    expect(res.statusCode).toBe(403);
  });

  it('a client with an expired membership is blocked from live signal access (membership gate enforced)', async () => {
    const res = await app.inject({ method: 'GET', url: '/client/signals', headers: authHeader('token-client-expired') });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('membership_inactive');
  });

  it('a client with an active membership can access their own signals list', async () => {
    const res = await app.inject({ method: 'GET', url: '/client/signals', headers: authHeader('token-client-a') });
    expect(res.statusCode).toBe(200);
    expect(res.json().signals).toEqual([]);
  });

  // ---------- Client isolation / IDOR, exercised over real HTTP with real sessions ----------

  it('client A cannot fetch a signal client A was never a recipient of (IDOR blocked at the route)', async () => {
    // Publish a signal while only client B is eligible.
    await pool.query(`UPDATE memberships SET status = 'EXPIRED' WHERE client_id = $1`, [clientA.clientId]);
    const { createDraft, publishSignal } = await import('../modules/signals/signals.service.js');
    const signal = await createDraft(adminUserId, {
      side: 'BUY',
      instrumentDisplayName: 'IDOR TEST SIGNAL',
      tradePlan: { entry: 100, stopLoss: 90, target1: 110, target2: null, target3: null, partialExitPercentages: null },
      brokerOrderHint: {
        broker: 'ANGEL_ONE',
        exchange: 'NFO',
        tradingSymbol: 'IDORTEST',
        symbolToken: null,
        side: 'BUY',
        orderType: 'LIMIT',
        productType: 'INTRADAY',
        quantity: 1,
      },
      notes: null,
    });
    const { randomUUID } = await import('node:crypto');
    await publishSignal(signal.id, adminUserId, randomUUID());
    await pool.query(`UPDATE memberships SET status = 'ACTIVE', expires_at = now() + interval '30 days' WHERE client_id = $1`, [
      clientA.clientId,
    ]);

    // Client A (re-activated AFTER publish, so never a recipient) tries to fetch it directly by ID.
    const res = await app.inject({
      method: 'GET',
      url: `/client/signals/${signal.id}`,
      headers: authHeader('token-client-a'),
    });
    expect(res.statusCode).toBe(404); // not 403 — we don't confirm the signal's existence to a non-recipient

    // Client B, who WAS a recipient, can fetch it.
    const resB = await app.inject({
      method: 'GET',
      url: `/client/signals/${signal.id}`,
      headers: authHeader('token-client-b'),
    });
    expect(resB.statusCode).toBe(200);
    expect(resB.json().signal.id).toBe(signal.id);
  });

  it('a suspended client (ACCOUNT status, not membership) is blocked even with a valid session token', async () => {
    await pool.query(`UPDATE clients SET status = 'SUSPENDED' WHERE id = $1`, [clientA.clientId]);
    const res = await app.inject({ method: 'GET', url: '/client/me', headers: authHeader('token-client-a') });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('client_not_active');
  });
});
