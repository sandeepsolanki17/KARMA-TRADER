import type { PoolClient } from 'pg';
import type { AuditAction, AuditEvent } from '@karma/types';
import { pool } from '../../db/pool.js';

interface AuditRow {
  id: string;
  actor_admin_id: string | null;
  org_id: string | null;
  action: string;
  target_type: string;
  target_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

function toAuditEvent(row: AuditRow): AuditEvent {
  return {
    id: row.id,
    actorAdminId: row.actor_admin_id,
    orgId: row.org_id,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    metadata: row.metadata,
    createdAt: row.created_at,
  };
}

export async function recordAuditEvent(
  params: {
    actorAdminId: string | null;
    orgId?: string | null;
    action: AuditAction;
    targetType: string;
    targetId: string;
    metadata?: Record<string, unknown>;
  },
  dbClient: PoolClient | typeof pool = pool,
): Promise<void> {
  await dbClient.query(
    `INSERT INTO audit_events (actor_admin_id, org_id, action, target_type, target_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [params.actorAdminId, params.orgId ?? null, params.action, params.targetType, params.targetId, JSON.stringify(params.metadata ?? {})],
  );
}

export async function listAuditEvents(orgId: string, limit = 200): Promise<AuditEvent[]> {
  const { rows } = await pool.query<AuditRow>('SELECT * FROM audit_events WHERE org_id = $1 ORDER BY created_at DESC LIMIT $2', [
    orgId,
    limit,
  ]);
  return rows.map(toAuditEvent);
}
