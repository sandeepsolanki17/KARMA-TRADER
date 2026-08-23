import { SignalStatus, SignalEventType, TERMINAL_SIGNAL_STATUSES } from './enums.js';

/**
 * Explicit allow-list of (currentStatus -> event) => nextStatus.
 * The API layer MUST run every signal mutation through `applyTransition`.
 * Never mutate `status` directly anywhere else in the codebase.
 */
type TransitionKey = `${SignalStatus}:${SignalEventType}`;

const TRANSITIONS: Partial<Record<TransitionKey, SignalStatus>> = {
  [`${SignalStatus.DRAFT}:${SignalEventType.PUBLISHED}`]: SignalStatus.PUBLISHED,
  [`${SignalStatus.DRAFT}:${SignalEventType.CANCELLED}`]: SignalStatus.CANCELLED,

  [`${SignalStatus.PUBLISHED}:${SignalEventType.ENTRY_HIT}`]: SignalStatus.ENTRY_HIT,
  [`${SignalStatus.PUBLISHED}:${SignalEventType.CANCELLED}`]: SignalStatus.CANCELLED,
  [`${SignalStatus.PUBLISHED}:${SignalEventType.EXPIRED}`]: SignalStatus.EXPIRED,
  [`${SignalStatus.PUBLISHED}:${SignalEventType.EXIT_NOW}`]: SignalStatus.EXITED,
  [`${SignalStatus.PUBLISHED}:${SignalEventType.SL_UPDATED}`]: SignalStatus.PUBLISHED,
  [`${SignalStatus.PUBLISHED}:${SignalEventType.TARGETS_UPDATED}`]: SignalStatus.PUBLISHED,

  [`${SignalStatus.ENTRY_HIT}:${SignalEventType.T1_HIT}`]: SignalStatus.T1_HIT,
  [`${SignalStatus.ENTRY_HIT}:${SignalEventType.EXPIRED}`]: SignalStatus.EXPIRED,
  [`${SignalStatus.ENTRY_HIT}:${SignalEventType.EXIT_NOW}`]: SignalStatus.EXITED,
  [`${SignalStatus.ENTRY_HIT}:${SignalEventType.SL_UPDATED}`]: SignalStatus.ENTRY_HIT,
  [`${SignalStatus.ENTRY_HIT}:${SignalEventType.TARGETS_UPDATED}`]: SignalStatus.ENTRY_HIT,

  [`${SignalStatus.T1_HIT}:${SignalEventType.T2_HIT}`]: SignalStatus.T2_HIT,
  [`${SignalStatus.T1_HIT}:${SignalEventType.EXIT_NOW}`]: SignalStatus.EXITED,
  [`${SignalStatus.T1_HIT}:${SignalEventType.SL_UPDATED}`]: SignalStatus.T1_HIT,
  [`${SignalStatus.T1_HIT}:${SignalEventType.CLOSED}`]: SignalStatus.CLOSED,

  [`${SignalStatus.T2_HIT}:${SignalEventType.T3_HIT}`]: SignalStatus.T3_HIT,
  [`${SignalStatus.T2_HIT}:${SignalEventType.EXIT_NOW}`]: SignalStatus.EXITED,
  [`${SignalStatus.T2_HIT}:${SignalEventType.SL_UPDATED}`]: SignalStatus.T2_HIT,
  [`${SignalStatus.T2_HIT}:${SignalEventType.CLOSED}`]: SignalStatus.CLOSED,

  [`${SignalStatus.T3_HIT}:${SignalEventType.CLOSED}`]: SignalStatus.CLOSED,
};

export class InvalidSignalTransitionError extends Error {
  constructor(public readonly from: SignalStatus, public readonly event: SignalEventType) {
    super(`Cannot apply event ${event} to signal in status ${from}`);
    this.name = 'InvalidSignalTransitionError';
  }
}

/**
 * Pure function: given current status + event, returns the next status or throws.
 * No side effects — the caller (signal service) is responsible for persistence,
 * event-log insertion, and notification enqueueing inside one DB transaction.
 */
export function applyTransition(current: SignalStatus, event: SignalEventType): SignalStatus {
  if (TERMINAL_SIGNAL_STATUSES.has(current)) {
    throw new InvalidSignalTransitionError(current, event);
  }
  const key = `${current}:${event}` as TransitionKey;
  const next = TRANSITIONS[key];
  if (!next) {
    throw new InvalidSignalTransitionError(current, event);
  }
  return next;
}

export function isTerminal(status: SignalStatus): boolean {
  return TERMINAL_SIGNAL_STATUSES.has(status);
}
