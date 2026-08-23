import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../db/pool.js';
import { closeQueues } from '../modules/notifications/queue.js';
import { createTestClient, resetDb } from './helpers.js';
import * as devicesRepo from '../modules/devices/devices.repo.js';
import { registerDeviceForClient } from '../modules/devices/deviceSession.service.js';

describe('single active device per client', () => {
  let orgId: string;
  beforeEach(async () => {
    await resetDb();
    const { rows: adminRows } = await pool.query<{ id: string }>(
      `INSERT INTO organizations (slug, name) VALUES ('test-org', 'Test Org') RETURNING id`
    );
    orgId = adminRows[0]!.id;
  });

  afterAll(async () => {
    await closeQueues();
    await pool.end();
  });

  it('registers a first device for a client with no prior device', async () => {
    const client = await createTestClient({ orgId });
    const { device, replacedDeviceId } = await registerDeviceForClient({
      clientId: client.clientId,
      expoPushToken: 'ExponentPushToken[phoneA]',
      platform: 'ANDROID',
      deviceName: 'Phone A',
      clerkSessionId: 'sess_a',
    });
    expect(replacedDeviceId).toBeNull();
    expect(await devicesRepo.listActiveDevicesForClient(client.clientId)).toEqual([expect.objectContaining({ id: device.id })]);
  });

  it('a new device login for the SAME client revokes the previous device — new login wins', async () => {
    const client = await createTestClient({ orgId });
    const first = await registerDeviceForClient({
      clientId: client.clientId,
      expoPushToken: 'ExponentPushToken[phoneA]',
      platform: 'ANDROID',
      deviceName: 'Phone A',
      clerkSessionId: 'sess_a',
    });

    const second = await registerDeviceForClient({
      clientId: client.clientId,
      expoPushToken: 'ExponentPushToken[phoneB]',
      platform: 'ANDROID',
      deviceName: 'Phone B',
      clerkSessionId: 'sess_b',
    });

    expect(second.replacedDeviceId).toBe(first.device.id);

    const active = await devicesRepo.listActiveDevicesForClient(client.clientId);
    expect(active).toHaveLength(1);
    expect(active[0]!.id).toBe(second.device.id);
    expect(active[0]!.expoPushToken).toBe('ExponentPushToken[phoneB]');
    expect(await devicesRepo.hasDifferentActiveSession(client.clientId, 'sess_a')).toBe(true);
    expect(await devicesRepo.hasDifferentActiveSession(client.clientId, 'sess_b')).toBe(false);
  });

  it('is race-safe: two simultaneous registrations for the same client never leave two active devices', async () => {
    const client = await createTestClient({ orgId });

    // Fire both "logins" at once — the DB-level partial unique index
    // (uniq_one_active_device_per_client) plus the row lock inside
    // registerDeviceForClient must guarantee exactly one survivor, not two.
    const [resultA, resultB] = await Promise.allSettled([
      registerDeviceForClient({
        clientId: client.clientId,
        expoPushToken: 'ExponentPushToken[race-1]',
        platform: 'ANDROID',
        deviceName: 'Race 1',
        clerkSessionId: 'sess_race_1',
      }),
      registerDeviceForClient({
        clientId: client.clientId,
        expoPushToken: 'ExponentPushToken[race-2]',
        platform: 'ANDROID',
        deviceName: 'Race 2',
        clerkSessionId: 'sess_race_2',
      }),
    ]);

    const active = await devicesRepo.listActiveDevicesForClient(client.clientId);
    expect(active).toHaveLength(1); // never two, regardless of which request "won"
    expect([resultA.status, resultB.status]).toContain('fulfilled');
  });

  it('different clients keep independent active devices — the rule is per-client, not platform-wide', async () => {
    const clientA = await createTestClient({ orgId });
    const clientB = await createTestClient({ orgId });

    await registerDeviceForClient({
      clientId: clientA.clientId,
      expoPushToken: 'ExponentPushToken[a-phone]',
      platform: 'ANDROID',
      deviceName: null,
      clerkSessionId: 'sess_a',
    });
    await registerDeviceForClient({
      clientId: clientB.clientId,
      expoPushToken: 'ExponentPushToken[b-phone]',
      platform: 'IOS',
      deviceName: null,
      clerkSessionId: 'sess_b',
    });

    expect(await devicesRepo.listActiveDevicesForClient(clientA.clientId)).toHaveLength(1);
    expect(await devicesRepo.listActiveDevicesForClient(clientB.clientId)).toHaveLength(1);
  });

  it('re-registering the same authenticated session updates push-token metadata in place', async () => {
    const client = await createTestClient({ orgId });
    const first = await registerDeviceForClient({
      clientId: client.clientId,
      expoPushToken: 'ExponentPushToken[same]',
      platform: 'ANDROID',
      deviceName: 'Phone',
      clerkSessionId: 'sess_1',
    });
    const second = await registerDeviceForClient({
      clientId: client.clientId,
      expoPushToken: 'ExponentPushToken[rotated]',
      platform: 'ANDROID',
      deviceName: 'Phone',
      clerkSessionId: 'sess_1',
    });
    expect(second.replacedDeviceId).toBeNull();
    expect(second.device.id).toBe(first.device.id);
    expect(second.device.expoPushToken).toBe('ExponentPushToken[rotated]');
    expect(await devicesRepo.listActiveDevicesForClient(client.clientId)).toHaveLength(1);
  });

  it('a revoked (superseded) device is immediately excluded from notification fanout', async () => {
    const client = await createTestClient({ orgId });
    const first = await registerDeviceForClient({
      clientId: client.clientId,
      expoPushToken: 'ExponentPushToken[old]',
      platform: 'ANDROID',
      deviceName: null,
      clerkSessionId: 'sess_old',
    });
    await registerDeviceForClient({
      clientId: client.clientId,
      expoPushToken: 'ExponentPushToken[new]',
      platform: 'ANDROID',
      deviceName: null,
      clerkSessionId: 'sess_new',
    });

    const fanoutTargets = await devicesRepo.listActiveDevicesForClients([client.clientId]);
    expect(fanoutTargets).toHaveLength(1);
    expect(fanoutTargets[0]!.id).not.toBe(first.device.id);
  });

  it('a previously revoked session cannot reactivate the superseded device', async () => {
    const client = await createTestClient({ orgId });
    await registerDeviceForClient({
      clientId: client.clientId,
      expoPushToken: 'ExponentPushToken[old-session]',
      platform: 'ANDROID',
      deviceName: 'Phone A',
      clerkSessionId: 'sess_old',
    });
    await registerDeviceForClient({
      clientId: client.clientId,
      expoPushToken: 'ExponentPushToken[new-session]',
      platform: 'ANDROID',
      deviceName: 'Phone B',
      clerkSessionId: 'sess_new',
    });

    await expect(registerDeviceForClient({
      clientId: client.clientId,
      expoPushToken: 'ExponentPushToken[old-again]',
      platform: 'ANDROID',
      deviceName: 'Phone A',
      clerkSessionId: 'sess_old',
    })).rejects.toThrow(/revoked/);

    const active = await devicesRepo.listActiveDevicesForClient(client.clientId);
    expect(active).toHaveLength(1);
    expect(active[0]!.expoPushToken).toBe('ExponentPushToken[new-session]');
  });

  it('a client cannot revoke another client\'s device (IDOR on the revoke path)', async () => {
    const clientA = await createTestClient({ orgId });
    const clientB = await createTestClient({ orgId });
    const { device } = await registerDeviceForClient({
      clientId: clientA.clientId,
      expoPushToken: 'ExponentPushToken[not-yours]',
      platform: 'IOS',
      deviceName: null,
      clerkSessionId: 'sess-a',
    });

    const ok = await devicesRepo.revokeDevice(device.id, clientB.clientId);
    expect(ok).toBe(false);
    expect(await devicesRepo.listActiveDevicesForClient(clientA.clientId)).toHaveLength(1);
  });

  it('an invalid Expo push token format causes automatic device revocation on send attempt', async () => {
    const client = await createTestClient({ orgId });
    const { device } = await registerDeviceForClient({
      clientId: client.clientId,
      expoPushToken: 'not-a-real-expo-token',
      platform: 'ANDROID',
      deviceName: null,
      clerkSessionId: 'sess-a',
    });

    const { sendExpoPush, PushDeliveryError } = await import('../modules/notifications/expoPush.js');
    await expect(
      sendExpoPush({
        expoPushToken: device.expoPushToken,
        deviceId: device.id,
        title: 't',
        body: 'b',
        data: {},
        priority: 'default',
      }),
    ).rejects.toThrow(PushDeliveryError);

    expect(await devicesRepo.listActiveDevicesForClient(client.clientId)).toHaveLength(0);
  });
});
