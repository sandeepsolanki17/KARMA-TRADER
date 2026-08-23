import type { FastifyInstance } from 'fastify';
import {
  cancelSignalSchema,
  createSignalDraftSchema,
  exitNowSchema,
  publishSignalSchema,
  targetHitSchema,
  updateStopLossSchema,
  updateTargetsSchema,
} from '@karma/types';
import { verifyClerkSession } from '../../auth/clerk.js';
import { requireActiveMembership, requireAdmin, requireClient } from '../../auth/rbac.js';
import * as service from './signals.service.js';
import { SignalNotFoundError } from './signals.service.js';
import { InvalidSignalTransitionError } from '@karma/types';
import * as repo from './signals.repo.js';
import { listJobsForSignal, deliverySummaryForSignal } from '../notifications/notificationJobs.repo.js';

function handleServiceError(err: unknown, reply: import('fastify').FastifyReply): boolean {
  if (err instanceof SignalNotFoundError) {
    reply.code(404).send({ error: 'signal_not_found' });
    return true;
  }
  if (err instanceof InvalidSignalTransitionError) {
    reply.code(409).send({ error: 'invalid_transition', from: err.from, event: err.event });
    return true;
  }
  return false;
}

export function registerSignalRoutes(app: FastifyInstance) {
  // ---------- Admin ----------

  app.post('/admin/signals', { preHandler: [verifyClerkSession, requireAdmin] }, async (request, reply) => {
    const parsed = createSignalDraftSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: 'invalid_body', issues: parsed.error.flatten() });
      return;
    }
    const signal = await service.createDraft(request.currentUser!.id, parsed.data);
    reply.code(201).send({ signal });
  });

  app.get('/admin/signals', { preHandler: [verifyClerkSession, requireAdmin] }, async (_request, reply) => {
    const signals = await repo.listSignals();
    reply.send({ signals });
  });

  app.get('/admin/signals/:signalId', { preHandler: [verifyClerkSession, requireAdmin] }, async (request, reply) => {
    const { signalId } = request.params as { signalId: string };
    const signal = await repo.findSignalById(signalId);
    if (!signal) {
      reply.code(404).send({ error: 'signal_not_found' });
      return;
    }
    const [events, delivery] = await Promise.all([
      repo.listEventsForSignal(signalId),
      deliverySummaryForSignal(signalId),
    ]);
    reply.send({ signal, events, delivery });
  });

  app.get(
    '/admin/signals/:signalId/deliveries',
    { preHandler: [verifyClerkSession, requireAdmin] },
    async (request, reply) => {
      const { signalId } = request.params as { signalId: string };
      const jobs = await listJobsForSignal(signalId);
      reply.send({ jobs });
    },
  );

  type MutationHandler = (signalId: string, adminId: string, body: unknown) => Promise<unknown>;

  const mutationRoute = (
    path: string,
    schema: { safeParse: (v: unknown) => { success: boolean; data?: any; error?: any } },
    handler: MutationHandler,
  ) => {
    app.post(path, { preHandler: [verifyClerkSession, requireAdmin] }, async (request, reply) => {
      const { signalId } = request.params as { signalId: string };
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({ error: 'invalid_body', issues: parsed.error?.flatten() });
        return;
      }
      try {
        const outcome = await handler(signalId, request.currentUser!.id, parsed.data);
        reply.send(outcome);
      } catch (err) {
        if (handleServiceError(err, reply)) return;
        throw err;
      }
    });
  };

  mutationRoute('/admin/signals/:signalId/publish', publishSignalSchema, (id, adminId, body: any) =>
    service.publishSignal(id, adminId, body.idempotencyKey),
  );
  mutationRoute('/admin/signals/:signalId/stop-loss', updateStopLossSchema, (id, adminId, body: any) =>
    service.updateStopLoss(id, adminId, body.stopLoss, body.idempotencyKey),
  );
  mutationRoute('/admin/signals/:signalId/targets', updateTargetsSchema, (id, adminId, body: any) =>
    service.updateTargets(
      id,
      adminId,
      { target1: body.target1, target2: body.target2, target3: body.target3 },
      body.idempotencyKey,
    ),
  );
  mutationRoute('/admin/signals/:signalId/entry-hit', targetHitSchema, (id, adminId, body: any) =>
    service.markEntryHit(id, adminId, body.idempotencyKey),
  );
  mutationRoute('/admin/signals/:signalId/t1-hit', targetHitSchema, (id, adminId, body: any) =>
    service.markT1Hit(id, adminId, body.idempotencyKey),
  );
  mutationRoute('/admin/signals/:signalId/t2-hit', targetHitSchema, (id, adminId, body: any) =>
    service.markT2Hit(id, adminId, body.idempotencyKey),
  );
  mutationRoute('/admin/signals/:signalId/t3-hit', targetHitSchema, (id, adminId, body: any) =>
    service.markT3Hit(id, adminId, body.idempotencyKey),
  );
  mutationRoute('/admin/signals/:signalId/close', targetHitSchema, (id, adminId, body: any) =>
    service.closeSignal(id, adminId, body.idempotencyKey),
  );
  mutationRoute('/admin/signals/:signalId/cancel', cancelSignalSchema, (id, adminId, body: any) =>
    service.cancelSignal(id, adminId, body.idempotencyKey, body.reason),
  );
  mutationRoute('/admin/signals/:signalId/expire', targetHitSchema, (id, adminId, body: any) =>
    service.expireSignal(id, adminId, body.idempotencyKey),
  );

  // Emergency exit — same shape, but worth its own explicit route for clarity/observability.
  app.post(
    '/admin/signals/:signalId/exit-now',
    { preHandler: [verifyClerkSession, requireAdmin] },
    async (request, reply) => {
      const { signalId } = request.params as { signalId: string };
      const parsed = exitNowSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({ error: 'invalid_body', issues: parsed.error.flatten() });
        return;
      }
      try {
        const outcome = await service.exitNow(signalId, request.currentUser!.id, parsed.data.idempotencyKey, parsed.data.reason);
        reply.send(outcome);
      } catch (err) {
        if (handleServiceError(err, reply)) return;
        throw err;
      }
    },
  );

  // ---------- Client ----------

  // Live/recent signals require an active membership.
  app.get(
    '/client/signals',
    { preHandler: [verifyClerkSession, requireClient, requireActiveMembership] },
    async (request, reply) => {
      const signals = await repo.listSignalsForClient(request.currentClient!.id);
      reply.send({ signals });
    },
  );

  // A specific signal the client was a recipient of remains viewable even if
  // membership later lapses — access is scoped to "were you entitled at publish time",
  // not "are you entitled right now". Live-only fields (broker order hint) are
  // still gated by requireActiveMembership.
  app.get('/client/signals/:signalId', { preHandler: [verifyClerkSession, requireClient] }, async (request, reply) => {
    const { signalId } = request.params as { signalId: string };
    const hasAccess = await repo.clientHasAccessToSignal(request.currentClient!.id, signalId);
    if (!hasAccess) {
      reply.code(404).send({ error: 'signal_not_found' });
      return;
    }
    const [signal, events] = await Promise.all([repo.findSignalById(signalId), repo.listEventsForSignal(signalId)]);
    reply.send({ signal, events });
  });
}
