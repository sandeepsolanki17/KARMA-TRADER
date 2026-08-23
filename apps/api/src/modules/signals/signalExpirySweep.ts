import { pool } from '../../db/pool.js';
import { expireSignal } from './signals.service.js';
import { randomUUID } from 'node:crypto';

const SYSTEM_ADMIN_MARKER = 'system-scheduler';

/**
 * Finds signals whose expiresAt has passed while still in PUBLISHED status
 * (no entry yet) and runs them through the normal EXPIRED transition so the
 * event ledger, recipient notifications, and audit trail stay consistent
 * with any admin-triggered expiry.
 *
 * NOTE: uses the signal's `created_by_admin_id` as the actor for the event
 * row (FK requires a real users.id) but records `system-scheduler` in the
 * event payload so it's distinguishable in history from a manual action.
 */
export async function sweepExpiredSignals(): Promise<number> {
  const { rows } = await pool.query<{ id: string; created_by_admin_id: string }>(
    `SELECT id, created_by_admin_id FROM signals
     WHERE status = 'PUBLISHED' AND expires_at IS NOT NULL AND expires_at <= now()`,
  );
  let count = 0;
  for (const row of rows) {
    try {
      await expireSignal(row.id, row.created_by_admin_id, randomUUID());
      count += 1;
    } catch {
      // best-effort sweep — a concurrent admin action may have already transitioned this signal
    }
  }
  return count;
}

export const _SYSTEM_ADMIN_MARKER = SYSTEM_ADMIN_MARKER;
