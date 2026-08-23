import type { PoolClient } from 'pg';
import {
  applyTransition,
  InvalidSignalTransitionError,
  SignalEventType,
  type CreateSignalDraftInput,
  type NotificationPriority,
  type Signal,
} from '@karma/types';
import { withTransaction } from '../../db/pool.js';
import * as repo from './signals.repo.js';
import { listEligibleRecipientClientIds } from '../clients/clients.repo.js';
import { listActiveDevicesForClients } from '../devices/devices.repo.js';
import { insertNotificationJobs } from '../notifications/notificationJobs.repo.js';
import { normalNotificationQueue, criticalNotificationQueue } from '../notifications/queue.js';
import { recordAuditEvent } from '../audit/audit.service.js';

export class SignalNotFoundError extends Error {
  constructor(id: string) {
    super(`Signal ${id} not found`);
  }
}

export async function createDraft(adminId: string, input: CreateSignalDraftInput): Promise<Signal> {
  return withTransaction(async (client) => {
    const signal = await repo.insertDraftSignal(adminId, input, client);
    await repo.insertSignalEvent(
      {
        signalId: signal.id,
        eventType: SignalEventType.CREATED,
        payload: { instrumentDisplayName: input.instrumentDisplayName },
        adminId,
        idempotencyKey: signal.id, // creation is naturally idempotent-once per row
      },
      client,
    );
    await recordAuditEvent(
      { actorAdminId: adminId, action: 'SIGNAL_CREATED', targetType: 'signal', targetId: signal.id },
      client,
    );
    return signal;
  });
}

interface TransitionOutcome {
  signal: Signal;
  alreadyApplied: boolean;
  notificationJobIds: { id: string; priority: NotificationPriority }[];
}

/**
 * Generic engine for every post-creation mutation. `mutate` returns the
 * partial column updates to apply alongside the status transition; it must
 * be a pure function of the locked, pre-transition signal.
 */
async function runTransition(params: {
  signalId: string;
  adminId: string;
  eventType: SignalEventType;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  priority: NotificationPriority;
  mutate?: (current: Signal) => Partial<{
    stopLoss: number;
    target1: number;
    target2: number | null;
    target3: number | null;
    publishedAt: string | null;
    expiresAt: string | null;
    closedAt: string | null;
  }>;
  /** Only true for PUBLISHED — freezes the recipient set. */
  snapshotRecipientsNow?: boolean;
}): Promise<TransitionOutcome> {
  return withTransaction(async (client) => {
    const current = await repo.findSignalByIdForUpdate(params.signalId, client);
    if (!current) throw new SignalNotFoundError(params.signalId);

    const existing = await repo.findExistingEvent(params.signalId, params.idempotencyKey, client);
    if (existing) {
      // Idempotent retry: same key already applied — return current state, no new side effects.
      return { signal: current, alreadyApplied: true, notificationJobIds: [] };
    }

    const nextStatus = applyTransition(current.status, params.eventType);
    const extra = params.mutate ? params.mutate(current) : {};
    const updated = await repo.updateSignal(params.signalId, { status: nextStatus, ...extra }, client);

    await repo.insertSignalEvent(
      {
        signalId: params.signalId,
        eventType: params.eventType,
        payload: params.payload,
        adminId: params.adminId,
        idempotencyKey: params.idempotencyKey,
      },
      client,
    );

    let recipientClientIds: string[];
    if (params.snapshotRecipientsNow) {
      recipientClientIds = await listEligibleRecipientClientIds();
      await repo.snapshotRecipients(params.signalId, recipientClientIds, client);
    } else {
      recipientClientIds = await repo.listRecipientClientIds(params.signalId);
    }

    const devices = await listActiveDevicesForClients(recipientClientIds);
    const jobs = devices.map((d) => ({
      signalId: params.signalId,
      clientId: d.clientId,
      deviceId: d.id,
      eventType: params.eventType,
      priority: params.priority,
    }));
    const insertedJobs = await insertNotificationJobs(jobs, client);

    await recordAuditEvent(
      {
        actorAdminId: params.adminId,
        action: eventTypeToAuditAction(params.eventType),
        targetType: 'signal',
        targetId: params.signalId,
        metadata: params.payload,
      },
      client,
    );

    return {
      signal: updated,
      alreadyApplied: false,
      notificationJobIds: insertedJobs.map((j) => ({ id: j.id, priority: j.priority })),
    };
  }).then(async (outcome) => {
    // Enqueue to Redis AFTER the DB transaction commits — never hold a DB
    // transaction open across a network call to Redis.
    for (const job of outcome.notificationJobIds) {
      const queue = job.priority === 'CRITICAL' ? criticalNotificationQueue : normalNotificationQueue;
      await queue.add('deliver', { notificationJobId: job.id }, { jobId: job.id });
    }
    return outcome;
  });
}

function eventTypeToAuditAction(eventType: SignalEventType): 'SIGNAL_PUBLISHED' | 'SIGNAL_UPDATED' | 'SIGNAL_CANCELLED' | 'SIGNAL_EXIT_NOW' {
  switch (eventType) {
    case SignalEventType.PUBLISHED:
      return 'SIGNAL_PUBLISHED';
    case SignalEventType.CANCELLED:
      return 'SIGNAL_CANCELLED';
    case SignalEventType.EXIT_NOW:
      return 'SIGNAL_EXIT_NOW';
    default:
      return 'SIGNAL_UPDATED';
  }
}

export function publishSignal(signalId: string, adminId: string, idempotencyKey: string) {
  return runTransition({
    signalId,
    adminId,
    eventType: SignalEventType.PUBLISHED,
    idempotencyKey,
    payload: {},
    priority: 'NORMAL',
    snapshotRecipientsNow: true,
    mutate: () => ({ publishedAt: new Date().toISOString() }),
  });
}

export function updateStopLoss(signalId: string, adminId: string, stopLoss: number, idempotencyKey: string) {
  return runTransition({
    signalId,
    adminId,
    eventType: SignalEventType.SL_UPDATED,
    idempotencyKey,
    payload: { stopLoss },
    priority: 'NORMAL',
    mutate: () => ({ stopLoss }),
  });
}

export function updateTargets(
  signalId: string,
  adminId: string,
  targets: { target1?: number; target2?: number | null; target3?: number | null },
  idempotencyKey: string,
) {
  return runTransition({
    signalId,
    adminId,
    eventType: SignalEventType.TARGETS_UPDATED,
    idempotencyKey,
    payload: targets,
    priority: 'NORMAL',
    mutate: () => targets,
  });
}

export function markEntryHit(signalId: string, adminId: string, idempotencyKey: string) {
  return runTransition({
    signalId,
    adminId,
    eventType: SignalEventType.ENTRY_HIT,
    idempotencyKey,
    payload: {},
    priority: 'NORMAL',
  });
}

export function markT1Hit(signalId: string, adminId: string, idempotencyKey: string) {
  return runTransition({ signalId, adminId, eventType: SignalEventType.T1_HIT, idempotencyKey, payload: {}, priority: 'NORMAL' });
}
export function markT2Hit(signalId: string, adminId: string, idempotencyKey: string) {
  return runTransition({ signalId, adminId, eventType: SignalEventType.T2_HIT, idempotencyKey, payload: {}, priority: 'NORMAL' });
}
export function markT3Hit(signalId: string, adminId: string, idempotencyKey: string) {
  return runTransition({ signalId, adminId, eventType: SignalEventType.T3_HIT, idempotencyKey, payload: {}, priority: 'NORMAL' });
}

export function closeSignal(signalId: string, adminId: string, idempotencyKey: string) {
  return runTransition({
    signalId,
    adminId,
    eventType: SignalEventType.CLOSED,
    idempotencyKey,
    payload: {},
    priority: 'NORMAL',
    mutate: () => ({ closedAt: new Date().toISOString() }),
  });
}

export function cancelSignal(signalId: string, adminId: string, idempotencyKey: string, reason?: string) {
  return runTransition({
    signalId,
    adminId,
    eventType: SignalEventType.CANCELLED,
    idempotencyKey,
    payload: { reason },
    priority: 'NORMAL',
  });
}

export function expireSignal(signalId: string, adminId: string, idempotencyKey: string) {
  return runTransition({
    signalId,
    adminId,
    eventType: SignalEventType.EXPIRED,
    idempotencyKey,
    payload: {},
    priority: 'NORMAL',
  });
}

/** Emergency exit — routed to the dedicated CRITICAL queue, original recipients only. */
export function exitNow(signalId: string, adminId: string, idempotencyKey: string, reason?: string) {
  return runTransition({
    signalId,
    adminId,
    eventType: SignalEventType.EXIT_NOW,
    idempotencyKey,
    payload: { reason },
    priority: 'CRITICAL',
    mutate: () => ({ closedAt: new Date().toISOString() }),
  });
}

export { InvalidSignalTransitionError };
