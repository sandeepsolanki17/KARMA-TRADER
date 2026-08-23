import type { PoolClient } from 'pg';
import type { NotificationJob, NotificationJobStatus, NotificationPriority, SignalEventType } from '@karma/types';
import { pool } from '../../db/pool.js';

interface NotificationJobRow {
  id: string;
  signal_id: string;
  client_id: string;
  device_id: string;
  event_type: SignalEventType;
  priority: NotificationPriority;
  status: NotificationJobStatus;
  attempts: number;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
}

function toJob(row: NotificationJobRow): NotificationJob {
  return {
    id: row.id,
    signalId: row.signal_id,
    clientId: row.client_id,
    deviceId: row.device_id,
    eventType: row.event_type,
    priority: row.priority,
    status: row.status,
    attempts: row.attempts,
    lastError: row.last_error,
    createdAt: row.created_at,
    sentAt: row.sent_at,
  };
}

export interface InsertNotificationJobParams {
  signalId: string;
  clientId: string;
  deviceId: string;
  eventType: SignalEventType;
  priority: NotificationPriority;
}

/** Insert one job per (client, device) pair inside the caller's transaction. */
export async function insertNotificationJobs(
  jobs: InsertNotificationJobParams[],
  dbClient: PoolClient,
): Promise<NotificationJob[]> {
  if (jobs.length === 0) return [];
  const values: string[] = [];
  const params: unknown[] = [];
  jobs.forEach((job, i) => {
    const base = i * 5;
    values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`);
    params.push(job.signalId, job.clientId, job.deviceId, job.eventType, job.priority);
  });
  const { rows } = await dbClient.query<NotificationJobRow>(
    `INSERT INTO notification_jobs (signal_id, client_id, device_id, event_type, priority)
     VALUES ${values.join(', ')} RETURNING *`,
    params,
  );
  return rows.map(toJob);
}

export async function findNotificationJobById(id: string): Promise<NotificationJob | null> {
  const { rows } = await pool.query<NotificationJobRow>('SELECT * FROM notification_jobs WHERE id = $1', [id]);
  return rows[0] ? toJob(rows[0]) : null;
}

export async function markJobSent(id: string): Promise<void> {
  await pool.query(`UPDATE notification_jobs SET status = 'SENT', sent_at = now() WHERE id = $1`, [id]);
}

export async function markJobFailed(id: string, error: string, deadLetter: boolean): Promise<void> {
  await pool.query(
    `UPDATE notification_jobs
     SET status = $2, attempts = attempts + 1, last_error = $3
     WHERE id = $1`,
    [id, deadLetter ? 'DEAD_LETTER' : 'FAILED', error.slice(0, 2000)],
  );
}

export async function listJobsForSignal(signalId: string): Promise<NotificationJob[]> {
  const { rows } = await pool.query<NotificationJobRow>(
    'SELECT * FROM notification_jobs WHERE signal_id = $1 ORDER BY created_at DESC',
    [signalId],
  );
  return rows.map(toJob);
}

/** Delivery status summary for the admin dashboard. */
export async function deliverySummaryForSignal(
  signalId: string,
): Promise<{ pending: number; sent: number; failed: number; deadLetter: number }> {
  const { rows } = await pool.query<{ status: NotificationJobStatus; count: string }>(
    'SELECT status, COUNT(*)::text as count FROM notification_jobs WHERE signal_id = $1 GROUP BY status',
    [signalId],
  );
  const summary = { pending: 0, sent: 0, failed: 0, deadLetter: 0 };
  for (const row of rows) {
    if (row.status === 'PENDING') summary.pending = Number(row.count);
    if (row.status === 'SENT') summary.sent = Number(row.count);
    if (row.status === 'FAILED') summary.failed = Number(row.count);
    if (row.status === 'DEAD_LETTER') summary.deadLetter = Number(row.count);
  }
  return summary;
}
