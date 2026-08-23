import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import rawBody from 'fastify-raw-body';
import { env } from './config/env.js';
import { registerHealthRoutes } from './modules/health/health.routes.js';
import { registerClientRoutes } from './modules/clients/clients.routes.js';
import { registerDeviceRoutes } from './modules/devices/devices.routes.js';
import { registerSignalRoutes } from './modules/signals/signals.routes.js';
import { registerOrganizationRoutes } from './modules/organizations/organizations.routes.js';
import { registerClerkWebhookRoutes } from './modules/webhooks/clerkWebhook.routes.js';
import { registerBrokerRoutes } from './modules/broker/broker.routes.js';
import { listAuditEvents } from './modules/audit/audit.service.js';
import { verifyClerkSession } from './auth/clerk.js';
import { requireAdmin } from './auth/rbac.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
    },
    trustProxy: true,
  });

  await app.register(helmet, {
    // Admin/client apps are separate origins consuming JSON — CSP for an API
    // process adds little; disable to avoid breaking non-HTML tool responses.
    contentSecurityPolicy: false,
  });

  await app.register(cors, {
    origin: env.CORS_ORIGIN.split(',').map((s) => s.trim()),
    credentials: true,
  });

  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
  });

  // Needed so the Clerk webhook route can verify the raw request bytes.
  await app.register(rawBody, {
    field: 'rawBody',
    global: false,
    encoding: 'utf8',
    runFirst: true,
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, 'Unhandled request error');
    const statusCode = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
    reply.code(statusCode).send({
      error: statusCode === 500 ? 'internal_error' : error.name || 'error',
      message: statusCode === 500 ? 'An unexpected error occurred.' : error.message,
    });
  });

  registerHealthRoutes(app);
  registerClientRoutes(app);
  registerDeviceRoutes(app);
  registerSignalRoutes(app);
  registerOrganizationRoutes(app);
  registerClerkWebhookRoutes(app, env.CLERK_WEBHOOK_SECRET);
  registerBrokerRoutes(app);

  app.get('/admin/audit', { preHandler: [verifyClerkSession, requireAdmin] }, async (request, reply) => {
    if (!request.currentOrg) {
      reply.send({ events: [] });
      return;
    }
    const events = await listAuditEvents(request.currentOrg.id);
    reply.send({ events });
  });

  return app;
}
