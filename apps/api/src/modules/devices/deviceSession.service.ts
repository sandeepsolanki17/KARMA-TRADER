import type { PoolClient } from 'pg';
import type { Device, DevicePlatform } from '@karma/types';
import { pool, withTransaction } from '../../db/pool.js';
import { clerkClient } from '../../auth/clerkClient.js';
import { recordAuditEvent } from '../audit/audit.service.js';

interface DeviceRow {
  id: string;
  client_id: string;
  expo_push_token: string;
  platform: DevicePlatform;
  device_name: string | null;
  clerk_session_id: string | null;
  revoked_at: string | null;
  created_at: string;
  last_active_at: string | null;
}

function toDevice(row: DeviceRow): Device {
  return {
    id: row.id,
    clientId: row.client_id,
    expoPushToken: row.expo_push_token,
    platform: row.platform,
    deviceName: row.device_name,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
    lastActiveAt: row.last_active_at,
  };
}

export class DeviceActivationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeviceActivationError';
  }
}

async function findActiveDeviceForClient(clientId: string, dbClient: PoolClient): Promise<DeviceRow | null> {
  const { rows } = await dbClient.query<DeviceRow>(
    'SELECT * FROM devices WHERE client_id = $1 AND revoked_at IS NULL FOR UPDATE',
    [clientId],
  );
  return rows[0] ?? null;
}

async function findRevokedSessionForClient(clientId: string, clerkSessionId: string, dbClient: PoolClient): Promise<DeviceRow | null> {
  const { rows } = await dbClient.query<DeviceRow>(
    `SELECT * FROM devices
     WHERE client_id = $1 AND clerk_session_id = $2 AND revoked_at IS NOT NULL
     ORDER BY revoked_at DESC LIMIT 1`,
    [clientId, clerkSessionId],
  );
  return rows[0] ?? null;
}

async function revokeClerkSessionBestEffort(sessionId: string | null): Promise<void> {
  if (!sessionId) return;
  try {
    await clerkClient.sessions.revokeSession(sessionId);
  } catch {
    // DB-side revocation is already authoritative for device eligibility.
  }
}

export async function registerDeviceForClient(params: {
  clientId: string;
  expoPushToken: string;
  platform: DevicePlatform;
  deviceName: string | null;
  clerkSessionId: string | null;
}): Promise<{ device: Device; replacedDeviceId: string | null }> {
  if (!params.clerkSessionId) {
    throw new DeviceActivationError('Authenticated Clerk session id is required for device activation.');
  }

  const result = await withTransaction(async (dbClient) => {
    const previouslyRevoked = await findRevokedSessionForClient(params.clientId, params.clerkSessionId!, dbClient);
    if (previouslyRevoked) {
      throw new DeviceActivationError('This Clerk session was revoked after another device was activated.');
    }

    const existing = await findActiveDeviceForClient(params.clientId, dbClient);

    // Same authenticated session re-registering (app restart, token refresh,
    // push-token rotation): update in place rather than treating token change
    // as a new device.
    if (existing && existing.clerk_session_id === params.clerkSessionId) {
      const { rows } = await dbClient.query<DeviceRow>(
        `UPDATE devices
         SET expo_push_token = $2, platform = $3, device_name = $4, last_active_at = now()
         WHERE id = $1 RETURNING *`,
        [existing.id, params.expoPushToken, params.platform, params.deviceName],
      );
      return { row: rows[0]!, replacedDeviceId: null, replacedSessionId: null };
    }

    if (existing) {
      await dbClient.query('UPDATE devices SET revoked_at = now() WHERE id = $1', [existing.id]);
    }

    const { rows } = await dbClient.query<DeviceRow>(
      `INSERT INTO devices (client_id, expo_push_token, platform, device_name, clerk_session_id, last_active_at)
       VALUES ($1, $2, $3, $4, $5, now()) RETURNING *`,
      [params.clientId, params.expoPushToken, params.platform, params.deviceName, params.clerkSessionId],
    );

    return {
      row: rows[0]!,
      replacedDeviceId: existing?.id ?? null,
      replacedSessionId: existing?.clerk_session_id ?? null,
    };
  });

  if (result.replacedDeviceId) {
    await revokeClerkSessionBestEffort(result.replacedSessionId);
    await recordAuditEvent({
      actorAdminId: null,
      action: 'DEVICE_REVOKED',
      targetType: 'device',
      targetId: result.replacedDeviceId,
      metadata: { reason: 'superseded_by_new_login', clientId: params.clientId },
    });
  }

  return { device: toDevice(result.row), replacedDeviceId: result.replacedDeviceId };
}
