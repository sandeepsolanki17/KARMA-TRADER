import type { FastifyInstance } from 'fastify';
import { pool } from '../../db/pool.js';
import { redisConnection } from '../notifications/queue.js';
import { isAngelOneConfigured, isClerkConfigured, isExpoPushConfigured } from '../../config/env.js';

export function registerHealthRoutes(app: FastifyInstance) {
  app.get('/health', async (_request, reply) => {
    reply.send({ ok: true });
  });

  app.get('/health/ready', async (_request, reply) => {
    const checks: Record<string, boolean> = {};

    try {
      await pool.query('SELECT 1');
      checks.postgres = true;
    } catch {
      checks.postgres = false;
    }

    try {
      const pong = await redisConnection.ping();
      checks.redis = pong === 'PONG';
    } catch {
      checks.redis = false;
    }

    checks.clerkConfigured = isClerkConfigured;
    checks.expoPushConfigured = isExpoPushConfigured;
    checks.angelOneConfigured = isAngelOneConfigured;

    const allCriticalOk = checks.postgres && checks.redis;
    reply.code(allCriticalOk ? 200 : 503).send({ ok: allCriticalOk, checks });
  });
}
