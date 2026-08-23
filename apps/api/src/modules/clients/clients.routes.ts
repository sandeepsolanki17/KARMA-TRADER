import type { FastifyInstance } from 'fastify';
import { createClientSchema, extendMembershipSchema, markPaymentSchema } from '@karma/types';
import { verifyClerkSession } from '../../auth/clerk.js';
import { requireAdmin, requireClient } from '../../auth/rbac.js';
import * as service from './clients.service.js';
import { DuplicateInviteError, NoOrgError } from './clients.service.js';
import * as membershipService from '../membership/membership.service.js';

export function registerClientRoutes(app: FastifyInstance) {
  // Invite a new client to this admin's org
  app.post('/admin/clients', { preHandler: [verifyClerkSession, requireAdmin] }, async (request, reply) => {
    const parsed = createClientSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: 'invalid_body', issues: parsed.error.flatten() });
      return;
    }
    if (!request.currentOrg) {
      reply.code(409).send({ error: 'org_not_setup', message: 'Set up your organization before inviting clients.' });
      return;
    }
    try {
      const client = await service.inviteClient(request.currentUser!.id, request.currentOrg.id, parsed.data);
      reply.code(201).send({ client });
    } catch (err) {
      if (err instanceof DuplicateInviteError) {
        reply.code(409).send({ error: 'duplicate_invite', message: err.message });
        return;
      }
      if (err instanceof NoOrgError) {
        reply.code(409).send({ error: 'org_not_setup', message: err.message });
        return;
      }
      throw err;
    }
  });

  // List clients in this admin's org only
  app.get('/admin/clients', { preHandler: [verifyClerkSession, requireAdmin] }, async (request, reply) => {
    if (!request.currentOrg) {
      reply.send({ clients: [] });
      return;
    }
    const clients = await service.listClients(request.currentOrg.id);
    reply.send({ clients });
  });

  app.get('/admin/clients/:clientId', { preHandler: [verifyClerkSession, requireAdmin] }, async (request, reply) => {
    const { clientId } = request.params as { clientId: string };
    const client = await service.findClientById(clientId);
    if (!client) {
      reply.code(404).send({ error: 'client_not_found' });
      return;
    }
    const membership = await membershipService.getMembershipForClient(clientId);
    reply.send({ client, membership });
  });

  for (const [path, status] of [
    ['/admin/clients/:clientId/activate', 'ACTIVE'],
    ['/admin/clients/:clientId/suspend', 'SUSPENDED'],
    ['/admin/clients/:clientId/deactivate', 'DEACTIVATED'],
  ] as const) {
    app.post(path, { preHandler: [verifyClerkSession, requireAdmin] }, async (request, reply) => {
      const { clientId } = request.params as { clientId: string };
      const updated = await service.setStatus(request.currentUser!.id, clientId, status);
      if (!updated) {
        reply.code(404).send({ error: 'client_not_found' });
        return;
      }
      reply.send({ client: updated });
    });
  }

  app.post(
    '/admin/clients/:clientId/membership/extend',
    { preHandler: [verifyClerkSession, requireAdmin] },
    async (request, reply) => {
      const { clientId } = request.params as { clientId: string };
      const parsed = extendMembershipSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({ error: 'invalid_body', issues: parsed.error.flatten() });
        return;
      }
      const membership = await membershipService.extendMembership(
        request.currentUser!.id,
        clientId,
        parsed.data.days,
        parsed.data.markPaymentReceived,
      );
      reply.send({ membership });
    },
  );

  app.post(
    '/admin/clients/:clientId/membership/mark-payment',
    { preHandler: [verifyClerkSession, requireAdmin] },
    async (request, reply) => {
      const { clientId } = request.params as { clientId: string };
      const parsed = markPaymentSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        reply.code(400).send({ error: 'invalid_body', issues: parsed.error.flatten() });
        return;
      }
      const membership = await membershipService.markPayment(request.currentUser!.id, clientId, parsed.data.note);
      reply.send({ membership });
    },
  );

  // Client self-service: view own profile + membership
  app.get('/client/me', { preHandler: [verifyClerkSession, requireClient] }, async (request, reply) => {
    const membership = await membershipService.getMembershipForClient(request.currentClient!.id);
    reply.send({ client: request.currentClient, membership });
  });
}
