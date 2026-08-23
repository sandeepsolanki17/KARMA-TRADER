import type { FastifyInstance } from 'fastify';
import { registerDeviceSchema } from '@karma/types';
import { verifyClerkSession } from '../../auth/clerk.js';
import { requireAdmin, requireClient } from '../../auth/rbac.js';
import * as repo from './devices.repo.js';
import { DeviceActivationError, registerDeviceForClient } from './deviceSession.service.js';
import { recordAuditEvent } from '../audit/audit.service.js';

export function registerDeviceRoutes(app: FastifyInstance) {
  app.post('/client/devices', { preHandler: [verifyClerkSession, requireClient] }, async (request, reply) => {
    const parsed = registerDeviceSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: 'invalid_body', issues: parsed.error.flatten() });
      return;
    }
    // Enforces ONE active device per client_id (not platform-wide): any
    // other device currently active for this same client is revoked first,
    // race-safe via a locked transaction + a DB-level partial unique index
    // (migration 0002) as a hard backstop. See deviceSession.service.ts.
    try {
      const { device, replacedDeviceId } = await registerDeviceForClient({
        clientId: request.currentClient!.id,
        expoPushToken: parsed.data.expoPushToken,
        platform: parsed.data.platform,
        deviceName: parsed.data.deviceName ?? null,
        clerkSessionId: request.auth?.sessionId ?? null,
      });
      reply.code(201).send({ device, replacedDeviceId });
    } catch (error) {
      if (error instanceof DeviceActivationError) {
        reply.code(401).send({ error: 'device_revoked', message: error.message });
        return;
      }
      request.log.error({ err: error }, 'Device activation failed');
      reply.code(500).send({ error: 'device_activation_failed', message: 'Device activation failed.' });
    }
  });

  app.get('/client/devices', { preHandler: [verifyClerkSession, requireClient] }, async (request, reply) => {
    const devices = await repo.listActiveDevicesForClient(request.currentClient!.id);
    reply.send({ devices });
  });

  app.delete(
    '/client/devices/:deviceId',
    { preHandler: [verifyClerkSession, requireClient] },
    async (request, reply) => {
      const { deviceId } = request.params as { deviceId: string };
      const ok = await repo.revokeDevice(deviceId, request.currentClient!.id);
      if (!ok) {
        reply.code(404).send({ error: 'device_not_found' });
        return;
      }
      reply.code(204).send();
    },
  );

  // Admin can revoke any client's device (lost phone, offboarding, security incident).
  app.delete(
    '/admin/clients/:clientId/devices/:deviceId',
    { preHandler: [verifyClerkSession, requireAdmin] },
    async (request, reply) => {
      const { deviceId } = request.params as { clientId: string; deviceId: string };
      const ok = await repo.adminRevokeDevice(deviceId);
      if (!ok) {
        reply.code(404).send({ error: 'device_not_found' });
        return;
      }
      await recordAuditEvent({
        actorAdminId: request.currentUser!.id,
        action: 'DEVICE_REVOKED',
        targetType: 'device',
        targetId: deviceId,
      });
      reply.code(204).send();
    },
  );
}
