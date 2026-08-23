import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { pool } from '../db/pool.js';
import { closeQueues } from '../modules/notifications/queue.js';
import { resetDb } from './helpers.js';

describe('HTTP auth boundary', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    await resetDb();
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await closeQueues();
    await pool.end();
  });

  it('GET /health is public and always 200', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('GET /health/ready reports postgres and redis reachable', async () => {
    const res = await app.inject({ method: 'GET', url: '/health/ready' });
    const body = res.json();
    expect(body.checks.postgres).toBe(true);
    expect(body.checks.redis).toBe(true);
    // Clerk is intentionally left as a placeholder in .env.test — this is
    // documented, not a bug: real auth flows need a real Clerk project.
    expect(body.checks.clerkConfigured).toBe(false);
  });

  it('admin routes reject requests with no Authorization header (401)', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin/clients' });
    expect(res.statusCode).toBe(401);
  });

  it('admin routes fail closed (500 server_misconfigured) rather than silently authorizing when Clerk keys are placeholders', async () => {
    // This documents current behavior honestly: with no real Clerk project,
    // NO bearer token can ever be accepted. The system never falls back to
    // trusting an unverified token — see auth/clerk.ts.
    const res = await app.inject({
      method: 'GET',
      url: '/admin/clients',
      headers: { authorization: 'Bearer some-token-that-cannot-be-verified' },
    });
    expect(res.statusCode).toBe(500);
    expect(res.json().error).toBe('server_misconfigured');
  });

  it('client routes are equally protected', async () => {
    const res = await app.inject({ method: 'GET', url: '/client/signals' });
    expect(res.statusCode).toBe(401);
  });

  it('the Clerk webhook route rejects requests missing svix headers', async () => {
    const res = await app.inject({ method: 'POST', url: '/webhooks/clerk', payload: { type: 'user.created' } });
    expect(res.statusCode).toBe(400);
  });
});
