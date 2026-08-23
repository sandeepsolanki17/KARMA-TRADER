import type { PoolClient } from 'pg';
import type {
  BrokerOrderHint,
  CreateSignalDraftInput,
  Signal,
  SignalEvent,
  SignalEventType,
  SignalStatus,
  TradePlan,
} from '@karma/types';
import { pool } from '../../db/pool.js';

interface SignalRow {
  id: string;
  created_by_admin_id: string;
  org_id: string;
  status: SignalStatus;
  side: 'BUY' | 'SELL';
  instrument_display_name: string;
  entry: string;
  stop_loss: string;
  target1: string;
  target2: string | null;
  target3: string | null;
  partial_exit_percentages: TradePlan['partialExitPercentages'];
  broker: BrokerOrderHint['broker'];
  exchange: string;
  trading_symbol: string;
  symbol_token: string | null;
  order_type: BrokerOrderHint['orderType'];
  product_type: string | null;
  quantity: number | null;
  notes: string | null;
  published_at: string | null;
  expires_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

function toSignal(row: SignalRow): Signal {
  return {
    id: row.id,
    createdByAdminId: row.created_by_admin_id,
    orgId: row.org_id,
    status: row.status,
    side: row.side,
    instrumentDisplayName: row.instrument_display_name,
    tradePlan: {
      entry: Number(row.entry),
      stopLoss: Number(row.stop_loss),
      target1: Number(row.target1),
      target2: row.target2 !== null ? Number(row.target2) : null,
      target3: row.target3 !== null ? Number(row.target3) : null,
      partialExitPercentages: row.partial_exit_percentages,
    },
    brokerOrderHint: {
      broker: row.broker,
      exchange: row.exchange,
      tradingSymbol: row.trading_symbol,
      symbolToken: row.symbol_token,
      side: row.side,
      orderType: row.order_type,
      productType: row.product_type,
      quantity: row.quantity,
    },
    notes: row.notes,
    publishedAt: row.published_at,
    expiresAt: row.expires_at,
    closedAt: row.closed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function insertDraftSignal(
  adminId: string,
  orgId: string,
  input: CreateSignalDraftInput,
  dbClient: PoolClient,
): Promise<Signal> {
  const { rows } = await dbClient.query<SignalRow>(
    `INSERT INTO signals (
       created_by_admin_id, org_id, side, instrument_display_name,
       entry, stop_loss, target1, target2, target3, partial_exit_percentages,
       broker, exchange, trading_symbol, symbol_token, order_type, product_type, quantity,
       notes, expires_at
     ) VALUES ($1,$2,$3,$4, $5,$6,$7,$8,$9,$10, $11,$12,$13,$14,$15,$16,$17, $18,$19)
     RETURNING *`,
    [
      adminId,
      orgId,
      input.side,
      input.instrumentDisplayName,
      input.tradePlan.entry,
      input.tradePlan.stopLoss,
      input.tradePlan.target1,
      input.tradePlan.target2,
      input.tradePlan.target3,
      JSON.stringify(input.tradePlan.partialExitPercentages),
      input.brokerOrderHint.broker,
      input.brokerOrderHint.exchange,
      input.brokerOrderHint.tradingSymbol,
      input.brokerOrderHint.symbolToken,
      input.brokerOrderHint.orderType,
      input.brokerOrderHint.productType,
      input.brokerOrderHint.quantity,
      input.notes ?? null,
      input.expiresAt ?? null,
    ],
  );
  return toSignal(rows[0]!);
}

export async function findSignalById(id: string, dbClient: PoolClient | typeof pool = pool): Promise<Signal | null> {
  const { rows } = await dbClient.query<SignalRow>('SELECT * FROM signals WHERE id = $1', [id]);
  return rows[0] ? toSignal(rows[0]) : null;
}

/** Row-level lock — call inside a transaction before applying a state transition. */
export async function findSignalByIdForUpdate(id: string, dbClient: PoolClient): Promise<Signal | null> {
  const { rows } = await dbClient.query<SignalRow>('SELECT * FROM signals WHERE id = $1 FOR UPDATE', [id]);
  return rows[0] ? toSignal(rows[0]) : null;
}

export async function listSignals(orgId: string, statusFilter?: SignalStatus[]): Promise<Signal[]> {
  if (statusFilter && statusFilter.length > 0) {
    const { rows } = await pool.query<SignalRow>(
      'SELECT * FROM signals WHERE org_id = $1 AND status = ANY($2) ORDER BY created_at DESC',
      [orgId, statusFilter],
    );
    return rows.map(toSignal);
  }
  const { rows } = await pool.query<SignalRow>('SELECT * FROM signals WHERE org_id = $1 ORDER BY created_at DESC', [orgId]);
  return rows.map(toSignal);
}

/** Signals visible to a given client: those in their recipient snapshot. */
export async function listSignalsForClient(clientId: string): Promise<Signal[]> {
  const { rows } = await pool.query<SignalRow>(
    `SELECT s.* FROM signals s
     JOIN signal_recipients r ON r.signal_id = s.id
     WHERE r.client_id = $1
     ORDER BY s.created_at DESC`,
    [clientId],
  );
  return rows.map(toSignal);
}

export async function clientHasAccessToSignal(clientId: string, signalId: string): Promise<boolean> {
  const { rows } = await pool.query(
    'SELECT 1 FROM signal_recipients WHERE client_id = $1 AND signal_id = $2',
    [clientId, signalId],
  );
  return rows.length > 0;
}

interface UpdateSignalFields {
  status?: SignalStatus;
  stopLoss?: number;
  target1?: number;
  target2?: number | null;
  target3?: number | null;
  publishedAt?: string | null;
  expiresAt?: string | null;
  closedAt?: string | null;
}

export async function updateSignal(id: string, fields: UpdateSignalFields, dbClient: PoolClient): Promise<Signal> {
  const sets: string[] = ['updated_at = now()'];
  const params: unknown[] = [];
  let idx = 1;

  const mapping: Array<[keyof UpdateSignalFields, string]> = [
    ['status', 'status'],
    ['stopLoss', 'stop_loss'],
    ['target1', 'target1'],
    ['target2', 'target2'],
    ['target3', 'target3'],
    ['publishedAt', 'published_at'],
    ['expiresAt', 'expires_at'],
    ['closedAt', 'closed_at'],
  ];
  for (const [key, column] of mapping) {
    if (fields[key] !== undefined) {
      sets.push(`${column} = $${idx}`);
      params.push(fields[key]);
      idx += 1;
    }
  }
  params.push(id);
  const { rows } = await dbClient.query<SignalRow>(
    `UPDATE signals SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
    params,
  );
  return toSignal(rows[0]!);
}

// ---------- Event ledger ----------

interface SignalEventRow {
  id: string;
  signal_id: string;
  event_type: SignalEventType;
  payload: Record<string, unknown>;
  created_by_admin_id: string;
  idempotency_key: string;
  created_at: string;
}

function toSignalEvent(row: SignalEventRow): SignalEvent {
  return {
    id: row.id,
    signalId: row.signal_id,
    eventType: row.event_type,
    payload: row.payload,
    createdByAdminId: row.created_by_admin_id,
    createdAt: row.created_at,
    idempotencyKey: row.idempotency_key,
  };
}

/** Returns null if this (signalId, idempotencyKey) pair was already applied — caller should treat as a no-op success. */
export async function findExistingEvent(
  signalId: string,
  idempotencyKey: string,
  dbClient: PoolClient,
): Promise<SignalEvent | null> {
  const { rows } = await dbClient.query<SignalEventRow>(
    'SELECT * FROM signal_events WHERE signal_id = $1 AND idempotency_key = $2',
    [signalId, idempotencyKey],
  );
  return rows[0] ? toSignalEvent(rows[0]) : null;
}

export async function insertSignalEvent(
  params: {
    signalId: string;
    eventType: SignalEventType;
    payload: Record<string, unknown>;
    adminId: string;
    idempotencyKey: string;
  },
  dbClient: PoolClient,
): Promise<SignalEvent> {
  const { rows } = await dbClient.query<SignalEventRow>(
    `INSERT INTO signal_events (signal_id, event_type, payload, created_by_admin_id, idempotency_key)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [params.signalId, params.eventType, JSON.stringify(params.payload), params.adminId, params.idempotencyKey],
  );
  return toSignalEvent(rows[0]!);
}

export async function listEventsForSignal(signalId: string): Promise<SignalEvent[]> {
  const { rows } = await pool.query<SignalEventRow>(
    'SELECT * FROM signal_events WHERE signal_id = $1 ORDER BY created_at ASC',
    [signalId],
  );
  return rows.map(toSignalEvent);
}

// ---------- Recipients ----------

export async function snapshotRecipients(
  signalId: string,
  clientIds: string[],
  dbClient: PoolClient,
): Promise<void> {
  if (clientIds.length === 0) return;
  const values = clientIds.map((_, i) => `($1, $${i + 2})`).join(', ');
  await dbClient.query(
    `INSERT INTO signal_recipients (signal_id, client_id) VALUES ${values} ON CONFLICT DO NOTHING`,
    [signalId, ...clientIds],
  );
}

export async function listRecipientClientIds(signalId: string): Promise<string[]> {
  const { rows } = await pool.query<{ client_id: string }>(
    'SELECT client_id FROM signal_recipients WHERE signal_id = $1',
    [signalId],
  );
  return rows.map((r) => r.client_id);
}
