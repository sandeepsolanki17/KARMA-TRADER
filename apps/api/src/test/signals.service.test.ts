import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { InvalidSignalTransitionError, SignalStatus } from '@karma/types';
import { pool } from '../db/pool.js';
import { closeQueues } from '../modules/notifications/queue.js';
import * as signalService from '../modules/signals/signals.service.js';
import * as signalRepo from '../modules/signals/signals.repo.js';
import { listJobsForSignal } from '../modules/notifications/notificationJobs.repo.js';
import { createTestAdmin, createTestClient, registerTestDevice, resetDb } from './helpers.js';

const draftInput = {
  side: 'BUY' as const,
  instrumentDisplayName: 'NIFTY 24 SEP 22000 CE',
  tradePlan: {
    entry: 150,
    stopLoss: 120,
    target1: 180,
    target2: 210,
    target3: null,
    partialExitPercentages: null,
  },
  brokerOrderHint: {
    broker: 'ANGEL_ONE' as const,
    exchange: 'NFO',
    tradingSymbol: 'NIFTY24SEP22000CE',
    symbolToken: null,
    side: 'BUY' as const,
    orderType: 'LIMIT' as const,
    productType: 'INTRADAY',
    quantity: 50,
  },
  notes: null,
};

describe('signals.service', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await closeQueues();
    await pool.end();
  });

  it('creates a draft in DRAFT status', async () => {
    const { adminId, orgId } = await createTestAdmin();
    const signal = await signalService.createDraft(adminId, orgId, draftInput);
    expect(signal.status).toBe(SignalStatus.DRAFT);
    expect(signal.tradePlan.entry).toBe(150);
  });

  it('publish freezes the recipient set to clients with active membership at that moment', async () => {
    const { adminId, orgId } = await createTestAdmin();
    const eligible = await createTestClient({ orgId });
    const ineligible = await createTestClient({ membershipActive: false, orgId });
    await registerTestDevice(eligible.clientId);
    await registerTestDevice(ineligible.clientId);

    const signal = await signalService.createDraft(adminId, orgId, draftInput);
    const { signal: published } = await signalService.publishSignal(signal.id, adminId, randomUUID());
    expect(published.status).toBe(SignalStatus.PUBLISHED);

    const recipientIds = await signalRepo.listRecipientClientIds(signal.id);
    expect(recipientIds).toEqual([eligible.clientId]);
    expect(recipientIds).not.toContain(ineligible.clientId);

    // A client who joins AFTER publish must not retroactively gain access to this signal.
    const lateJoiner = await createTestClient({ orgId });
    const hasAccess = await signalRepo.clientHasAccessToSignal(lateJoiner.clientId, signal.id);
    expect(hasAccess).toBe(false);
  });

  it('retrying a mutation with the same idempotency key is a no-op (no duplicate event, no duplicate notification jobs)', async () => {
    const { adminId, orgId } = await createTestAdmin();
    const client = await createTestClient({ orgId });
    await registerTestDevice(client.clientId);

    const signal = await signalService.createDraft(adminId, orgId, draftInput);
    const key = randomUUID();

    const first = await signalService.publishSignal(signal.id, adminId, key);
    expect(first.alreadyApplied).toBe(false);

    const second = await signalService.publishSignal(signal.id, adminId, key);
    expect(second.alreadyApplied).toBe(true);
    expect(second.signal.status).toBe(SignalStatus.PUBLISHED);

    const events = await signalRepo.listEventsForSignal(signal.id);
    const publishEvents = events.filter((e) => e.eventType === 'PUBLISHED');
    expect(publishEvents).toHaveLength(1);

    const jobs = await listJobsForSignal(signal.id);
    expect(jobs).toHaveLength(1); // one device, one job — not doubled by the retry
  });

  it('a different idempotency key for the same logical action is rejected by the state machine (already PUBLISHED)', async () => {
    const { adminId, orgId } = await createTestAdmin();
    const signal = await signalService.createDraft(adminId, orgId, draftInput);
    await signalService.publishSignal(signal.id, adminId, randomUUID());

    await expect(signalService.publishSignal(signal.id, adminId, randomUUID())).rejects.toThrow(
      InvalidSignalTransitionError,
    );
  });

  it('rejects T1 hit before entry is recorded', async () => {
    const { adminId, orgId } = await createTestAdmin();
    const signal = await signalService.createDraft(adminId, orgId, draftInput);
    await signalService.publishSignal(signal.id, adminId, randomUUID());
    await expect(signalService.markT1Hit(signal.id, adminId, randomUUID())).rejects.toThrow(
      InvalidSignalTransitionError,
    );
  });

  it('walks entry -> T1 -> T2 -> T3 -> close and stamps closedAt', async () => {
    const { adminId, orgId } = await createTestAdmin();
    const signal = await signalService.createDraft(adminId, orgId, draftInput);
    await signalService.publishSignal(signal.id, adminId, randomUUID());
    await signalService.markEntryHit(signal.id, adminId, randomUUID());
    await signalService.markT1Hit(signal.id, adminId, randomUUID());
    await signalService.markT2Hit(signal.id, adminId, randomUUID());
    const { signal: t3 } = await signalService.markT3Hit(signal.id, adminId, randomUUID());
    expect(t3.status).toBe(SignalStatus.T3_HIT);
    const { signal: closed } = await signalService.closeSignal(signal.id, adminId, randomUUID());
    expect(closed.status).toBe(SignalStatus.CLOSED);
    expect(closed.closedAt).not.toBeNull();
  });

  it('EXIT NOW enqueues jobs on the CRITICAL priority and sets closedAt', async () => {
    const { adminId, orgId } = await createTestAdmin();
    const client = await createTestClient({ orgId });
    await registerTestDevice(client.clientId);
    const signal = await signalService.createDraft(adminId, orgId, draftInput);
    await signalService.publishSignal(signal.id, adminId, randomUUID());
    await signalService.markEntryHit(signal.id, adminId, randomUUID());

    const { signal: exited } = await signalService.exitNow(signal.id, adminId, randomUUID(), 'Market reversal');
    expect(exited.status).toBe(SignalStatus.EXITED);
    expect(exited.closedAt).not.toBeNull();

    const jobs = await listJobsForSignal(signal.id);
    const exitJob = jobs.find((j) => j.eventType === 'EXIT_NOW');
    expect(exitJob?.priority).toBe('CRITICAL');
  });

  it('stop-loss update keeps status unchanged but persists the new value', async () => {
    const { adminId, orgId } = await createTestAdmin();
    const signal = await signalService.createDraft(adminId, orgId, draftInput);
    await signalService.publishSignal(signal.id, adminId, randomUUID());
    const { signal: updated } = await signalService.updateStopLoss(signal.id, adminId, 125, randomUUID());
    expect(updated.status).toBe(SignalStatus.PUBLISHED);
    expect(updated.tradePlan.stopLoss).toBe(125);
  });
});
