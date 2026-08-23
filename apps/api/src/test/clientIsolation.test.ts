import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { pool } from '../db/pool.js';
import { closeQueues } from '../modules/notifications/queue.js';
import * as signalService from '../modules/signals/signals.service.js';
import * as signalRepo from '../modules/signals/signals.repo.js';
import { createTestAdmin, createTestClient, registerTestDevice, resetDb } from './helpers.js';

const draftInput = {
  side: 'SELL' as const,
  instrumentDisplayName: 'BANKNIFTY 24 SEP 48000 PE',
  tradePlan: { entry: 90, stopLoss: 110, target1: 70, target2: null, target3: null, partialExitPercentages: null },
  brokerOrderHint: {
    broker: 'ANGEL_ONE' as const,
    exchange: 'NFO',
    tradingSymbol: 'BANKNIFTY24SEP48000PE',
    symbolToken: null,
    side: 'SELL' as const,
    orderType: 'LIMIT' as const,
    productType: 'INTRADAY',
    quantity: 25,
  },
  notes: null,
};

describe('client isolation', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await closeQueues();
    await pool.end();
  });

  it('a client only sees signals they were a recipient of, never another client\'s', async () => {
    const { adminId, orgId } = await createTestAdmin();
    const clientA = await createTestClient({ orgId });
    const clientB = await createTestClient({ orgId });
    await registerTestDevice(clientA.clientId);
    await registerTestDevice(clientB.clientId);

    // Publish one signal while both are eligible — both should see it.
    const sharedSignal = await signalService.createDraft(adminId, orgId, draftInput);
    await signalService.publishSignal(sharedSignal.id, adminId, randomUUID());

    const aSignals = await signalRepo.listSignalsForClient(clientA.clientId);
    const bSignals = await signalRepo.listSignalsForClient(clientB.clientId);
    expect(aSignals.map((s) => s.id)).toContain(sharedSignal.id);
    expect(bSignals.map((s) => s.id)).toContain(sharedSignal.id);

    // Suspend client B's membership, then publish a second signal — only A should get it.
    await pool.query(`UPDATE memberships SET status = 'EXPIRED' WHERE client_id = $1`, [clientB.clientId]);
    const secondSignal = await signalService.createDraft(adminId, orgId, draftInput);
    await signalService.publishSignal(secondSignal.id, adminId, randomUUID());

    expect(await signalRepo.clientHasAccessToSignal(clientA.clientId, secondSignal.id)).toBe(true);
    expect(await signalRepo.clientHasAccessToSignal(clientB.clientId, secondSignal.id)).toBe(false);

    // Direct IDOR check: client B must not be able to fetch signal details for a signal they don't own.
    const bAccessToFirst = await signalRepo.clientHasAccessToSignal(clientB.clientId, sharedSignal.id);
    expect(bAccessToFirst).toBe(true); // they WERE eligible when it was published
    const bAccessToSecond = await signalRepo.clientHasAccessToSignal(clientB.clientId, secondSignal.id);
    expect(bAccessToSecond).toBe(false); // they were NOT eligible for this one
  });

  it('notification jobs for EXIT NOW only target clients who were recipients of that specific signal', async () => {
    const { adminId, orgId } = await createTestAdmin();
    const clientA = await createTestClient({ orgId });
    const clientB = await createTestClient({ orgId });
    await registerTestDevice(clientA.clientId);
    await registerTestDevice(clientB.clientId);

    const signal = await signalService.createDraft(adminId, orgId, draftInput);
    await signalService.publishSignal(signal.id, adminId, randomUUID());

    // Client B loses membership AFTER publish (already a recipient) — they keep access to this signal's updates,
    // since recipient snapshot was frozen at publish time. This matches the documented product decision.
    await pool.query(`UPDATE memberships SET status = 'EXPIRED' WHERE client_id = $1`, [clientB.clientId]);

    const { notificationJobIds } = await signalService.exitNow(signal.id, adminId, randomUUID());
    // Both original recipients still get the critical exit notification.
    expect(notificationJobIds.length).toBe(2);
  });
});
