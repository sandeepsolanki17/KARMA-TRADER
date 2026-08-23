import type { Device, DevicePlatform } from '@karma/types';
import { pool } from '../../db/pool.js';

interface DeviceRow {
  id: string;
  client_id: string;
  expo_push_token: string;
  platform: DevicePlatform;
  device_name: string | null;
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

/**
 * Registers (or re-activates) a device for a client. If the same Expo push
 * token is re-registered by the same client after being revoked, it's
 * reactivated rather than duplicated (unique index is scoped to non-revoked rows).
 *
 * @deprecated for CLIENT-facing registration — use
 * deviceSession.service.registerDeviceForClient, which additionally
 * enforces the one-active-device-per-client rule. This raw insert would
 * now violate uniq_one_active_device_per_client (migration 0002) if the
 * client already has a different active device, by design.
 */
export async function registerDevice(
  clientId: string,
  expoPushToken: string,
  platform: DevicePlatform,
  deviceName: string | null,
): Promise<Device> {
  const existing = await pool.query<DeviceRow>(
    'SELECT * FROM devices WHERE expo_push_token = $1 AND revoked_at IS NULL',
    [expoPushToken],
  );
  if (existing.rows[0]) {
    // Token already active for some client — if it's a different client (device changed hands
    // or token reused), move it to the new client rather than erroring.
    const { rows } = await pool.query<DeviceRow>(
      `UPDATE devices SET client_id = $2, platform = $3, device_name = $4, last_active_at = now()
       WHERE id = $1 RETURNING *`,
      [existing.rows[0].id, clientId, platform, deviceName],
    );
    return toDevice(rows[0]!);
  }
  const { rows } = await pool.query<DeviceRow>(
    `INSERT INTO devices (client_id, expo_push_token, platform, device_name, last_active_at)
     VALUES ($1, $2, $3, $4, now()) RETURNING *`,
    [clientId, expoPushToken, platform, deviceName],
  );
  return toDevice(rows[0]!);
}

export async function listActiveDevicesForClient(clientId: string): Promise<Device[]> {
  const { rows } = await pool.query<DeviceRow>(
    'SELECT * FROM devices WHERE client_id = $1 AND revoked_at IS NULL ORDER BY created_at DESC',
    [clientId],
  );
  return rows.map(toDevice);
}

/**
 * Returns true when a client has already activated a different Clerk session.
 * This is intentionally checked on server requests as well as during device
 * registration: revoking an Expo token alone must never leave an old phone
 * able to read client data until its Clerk JWT happens to refresh.
 */
export async function hasDifferentActiveSession(clientId: string, clerkSessionId: string | null): Promise<boolean> {
  const { rows } = await pool.query<{ has_different_active_session: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM devices
       WHERE client_id = $1
         AND revoked_at IS NULL
         AND (clerk_session_id IS DISTINCT FROM $2)
     ) AS has_different_active_session`,
    [clientId, clerkSessionId],
  );
  return rows[0]?.has_different_active_session ?? false;
}

export async function listActiveDevicesForClients(clientIds: string[]): Promise<Device[]> {
  if (clientIds.length === 0) return [];
  const { rows } = await pool.query<DeviceRow>(
    'SELECT * FROM devices WHERE client_id = ANY($1) AND revoked_at IS NULL',
    [clientIds],
  );
  return rows.map(toDevice);
}

export async function revokeDevice(deviceId: string, clientId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    'UPDATE devices SET revoked_at = now() WHERE id = $1 AND client_id = $2 AND revoked_at IS NULL',
    [deviceId, clientId],
  );
  return (rowCount ?? 0) > 0;
}

/** Admin-initiated revocation of any client's device. */
export async function adminRevokeDevice(deviceId: string): Promise<boolean> {
  const { rowCount } = await pool.query('UPDATE devices SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL', [
    deviceId,
  ]);
  return (rowCount ?? 0) > 0;
}

export async function findDeviceById(deviceId: string): Promise<Device | null> {
  const { rows } = await pool.query<DeviceRow>('SELECT * FROM devices WHERE id = $1', [deviceId]);
  return rows[0] ? toDevice(rows[0]) : null;
}
