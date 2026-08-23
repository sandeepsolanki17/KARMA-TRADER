import type { FastifyInstance } from 'fastify';
import { verifyClerkSession } from '../../auth/clerk.js';
import { requireAdmin } from '../../auth/rbac.js';
import { angelOneProvider } from './angelOneProvider.js';

export function registerBrokerRoutes(app: FastifyInstance) {
  app.get('/admin/broker/health', { preHandler: [verifyClerkSession, requireAdmin] }, async (_request, reply) => {
    const status = await angelOneProvider.healthCheck();
    reply.send({ broker: status });
  });

  app.get(
    '/admin/broker/resolve-instrument',
    { preHandler: [verifyClerkSession, requireAdmin] },
    async (request, reply) => {
      const { exchange, tradingSymbol } = request.query as { exchange?: string; tradingSymbol?: string };
      if (!exchange || !tradingSymbol) {
        reply.code(400).send({ error: 'invalid_query', message: 'exchange and tradingSymbol are required.' });
        return;
      }
      const resolution = await angelOneProvider.resolveInstrument(exchange, tradingSymbol);
      reply.send({ resolution });
    },
  );
}
