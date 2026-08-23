import { describe, expect, it } from 'vitest';
import { applyTransition, InvalidSignalTransitionError, SignalEventType, SignalStatus, isTerminal } from '@karma/types';

describe('signal state machine', () => {
  it('walks the full happy path: DRAFT -> PUBLISHED -> ENTRY_HIT -> T1 -> T2 -> T3 -> CLOSED', () => {
    let status: SignalStatus = SignalStatus.DRAFT;
    status = applyTransition(status, SignalEventType.PUBLISHED);
    expect(status).toBe(SignalStatus.PUBLISHED);
    status = applyTransition(status, SignalEventType.ENTRY_HIT);
    expect(status).toBe(SignalStatus.ENTRY_HIT);
    status = applyTransition(status, SignalEventType.T1_HIT);
    expect(status).toBe(SignalStatus.T1_HIT);
    status = applyTransition(status, SignalEventType.T2_HIT);
    expect(status).toBe(SignalStatus.T2_HIT);
    status = applyTransition(status, SignalEventType.T3_HIT);
    expect(status).toBe(SignalStatus.T3_HIT);
    status = applyTransition(status, SignalEventType.CLOSED);
    expect(status).toBe(SignalStatus.CLOSED);
    expect(isTerminal(status)).toBe(true);
  });

  it('allows EXIT NOW from PUBLISHED, ENTRY_HIT, T1_HIT, and T2_HIT', () => {
    for (const from of [
      SignalStatus.PUBLISHED,
      SignalStatus.ENTRY_HIT,
      SignalStatus.T1_HIT,
      SignalStatus.T2_HIT,
    ] as const) {
      expect(applyTransition(from, SignalEventType.EXIT_NOW)).toBe(SignalStatus.EXITED);
    }
  });

  it('rejects EXIT NOW from DRAFT (never published, nothing to exit)', () => {
    expect(() => applyTransition(SignalStatus.DRAFT, SignalEventType.EXIT_NOW)).toThrow(InvalidSignalTransitionError);
  });

  it('rejects skipping T1 to go straight to T2', () => {
    expect(() => applyTransition(SignalStatus.ENTRY_HIT, SignalEventType.T2_HIT)).toThrow(
      InvalidSignalTransitionError,
    );
  });

  it('rejects any transition once a signal is terminal (CANCELLED, EXPIRED, EXITED, CLOSED)', () => {
    for (const terminal of [
      SignalStatus.CANCELLED,
      SignalStatus.EXPIRED,
      SignalStatus.EXITED,
      SignalStatus.CLOSED,
    ] as const) {
      expect(() => applyTransition(terminal, SignalEventType.SL_UPDATED)).toThrow(InvalidSignalTransitionError);
      expect(() => applyTransition(terminal, SignalEventType.EXIT_NOW)).toThrow(InvalidSignalTransitionError);
    }
  });

  it('allows SL updates while a trade is live (PUBLISHED, ENTRY_HIT, T1_HIT, T2_HIT) without changing status', () => {
    for (const from of [
      SignalStatus.PUBLISHED,
      SignalStatus.ENTRY_HIT,
      SignalStatus.T1_HIT,
      SignalStatus.T2_HIT,
    ] as const) {
      expect(applyTransition(from, SignalEventType.SL_UPDATED)).toBe(from);
    }
  });

  it('allows cancellation only before entry (DRAFT or PUBLISHED)', () => {
    expect(applyTransition(SignalStatus.DRAFT, SignalEventType.CANCELLED)).toBe(SignalStatus.CANCELLED);
    expect(applyTransition(SignalStatus.PUBLISHED, SignalEventType.CANCELLED)).toBe(SignalStatus.CANCELLED);
    expect(() => applyTransition(SignalStatus.ENTRY_HIT, SignalEventType.CANCELLED)).toThrow(
      InvalidSignalTransitionError,
    );
  });

  it('allows time-based expiry only before entry (PUBLISHED or ENTRY_HIT, per guide: no entry recorded)', () => {
    expect(applyTransition(SignalStatus.PUBLISHED, SignalEventType.EXPIRED)).toBe(SignalStatus.EXPIRED);
    expect(applyTransition(SignalStatus.ENTRY_HIT, SignalEventType.EXPIRED)).toBe(SignalStatus.EXPIRED);
  });
});
