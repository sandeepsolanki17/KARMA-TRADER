import type { Signal, SignalEventType } from '@karma/types';

export function buildPushContent(
  signal: Signal,
  eventType: SignalEventType,
): { title: string; body: string; priority: 'default' | 'high' } {
  const name = signal.instrumentDisplayName;
  switch (eventType) {
    case 'PUBLISHED':
      return {
        title: `New signal: ${name}`,
        body: `${signal.side} ${name} — Entry ${signal.tradePlan.entry}, SL ${signal.tradePlan.stopLoss}`,
        priority: 'high',
      };
    case 'SL_UPDATED':
      return { title: `SL updated: ${name}`, body: `New stop loss: ${signal.tradePlan.stopLoss}`, priority: 'high' };
    case 'TARGETS_UPDATED':
      return { title: `Targets updated: ${name}`, body: 'Trade plan targets were revised.', priority: 'default' };
    case 'ENTRY_HIT':
      return { title: `Entry hit: ${name}`, body: `Entry triggered at ${signal.tradePlan.entry}.`, priority: 'high' };
    case 'T1_HIT':
      return { title: `T1 hit: ${name}`, body: `Target 1 (${signal.tradePlan.target1}) reached.`, priority: 'high' };
    case 'T2_HIT':
      return {
        title: `T2 hit: ${name}`,
        body: `Target 2 (${signal.tradePlan.target2 ?? '—'}) reached.`,
        priority: 'high',
      };
    case 'T3_HIT':
      return {
        title: `T3 hit: ${name}`,
        body: `Target 3 (${signal.tradePlan.target3 ?? '—'}) reached. Trade complete.`,
        priority: 'high',
      };
    case 'EXIT_NOW':
      return { title: `⚠️ EXIT NOW: ${name}`, body: 'Emergency exit issued. Close your position immediately.', priority: 'high' };
    case 'CANCELLED':
      return { title: `Signal cancelled: ${name}`, body: 'This signal was cancelled before entry.', priority: 'default' };
    case 'EXPIRED':
      return { title: `Signal expired: ${name}`, body: 'This signal expired without an entry.', priority: 'default' };
    case 'CLOSED':
      return { title: `Signal closed: ${name}`, body: 'This trade has been closed.', priority: 'default' };
    default:
      return { title: `Update: ${name}`, body: 'A signal you follow was updated.', priority: 'default' };
  }
}
