import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  useSignal,
  usePublishSignal,
  useMarkEntryHit,
  useMarkT1Hit,
  useMarkT2Hit,
  useMarkT3Hit,
  useCloseSignal,
  useCancelSignal,
  useExitNow,
  useUpdateStopLoss,
} from '../lib/queries';
import { StatusBadge } from '../components/StatusBadge';
import type { SignalStatus } from '@karma/types';

const NEXT_ACTION: Partial<Record<SignalStatus, { label: string; hook: 'publish' | 'entry' | 't1' | 't2' | 't3' | 'close' }>> = {
  DRAFT: { label: 'Publish', hook: 'publish' },
  PUBLISHED: { label: 'Mark Entry Hit', hook: 'entry' },
  ENTRY_HIT: { label: 'Mark T1 Hit', hook: 't1' },
  T1_HIT: { label: 'Mark T2 Hit', hook: 't2' },
  T2_HIT: { label: 'Mark T3 Hit', hook: 't3' },
  T3_HIT: { label: 'Close Trade', hook: 'close' },
};

const CAN_CANCEL: SignalStatus[] = ['DRAFT', 'PUBLISHED'];
const CAN_EXIT: SignalStatus[] = ['PUBLISHED', 'ENTRY_HIT', 'T1_HIT', 'T2_HIT'];

export function SignalDetailPage() {
  const { signalId } = useParams();
  const { data, isLoading } = useSignal(signalId);
  const [exitConfirm, setExitConfirm] = useState(false);
  const [slValue, setSlValue] = useState<string | null>(null);

  const publish = usePublishSignal();
  const entryHit = useMarkEntryHit();
  const t1 = useMarkT1Hit();
  const t2 = useMarkT2Hit();
  const t3 = useMarkT3Hit();
  const close = useCloseSignal();
  const cancel = useCancelSignal();
  const exitNow = useExitNow();
  const updateSl = useUpdateStopLoss();

  if (isLoading || !data) return <div className="text-muted text-sm">Loading…</div>;

  const { signal, events, delivery } = data;
  const nextAction = NEXT_ACTION[signal.status];
  const hookMap = { publish, entry: entryHit, t1, t2, t3, close } as const;

  const runNext = () => {
    if (!nextAction || !signalId) return;
    hookMap[nextAction.hook].mutate({ signalId });
  };

  const handleExit = () => {
    if (!signalId) return;
    exitNow.mutate({ signalId, body: { reason: 'Manual emergency exit from admin console' } });
    setExitConfirm(false);
  };

  const handleSlSave = () => {
    if (!signalId || slValue === null) return;
    updateSl.mutate({ signalId, stopLoss: Number(slValue) });
    setSlValue(null);
  };

  return (
    <div className="flex flex-col gap-5 max-w-4xl">
      <div className="glass p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="font-display text-xl font-semibold">{signal.instrumentDisplayName}</h1>
            <div className="eyebrow mt-1">
              {signal.side} · {signal.brokerOrderHint.exchange}:{signal.brokerOrderHint.tradingSymbol}
            </div>
          </div>
          <StatusBadge status={signal.status} />
        </div>

        <div className="grid grid-cols-4 gap-4 mb-5">
          <Field label="Entry" value={signal.tradePlan.entry} />
          <Field
            label="Stop Loss"
            value={signal.tradePlan.stopLoss}
            editable
            editing={slValue !== null}
            onEdit={() => setSlValue(String(signal.tradePlan.stopLoss))}
            editValue={slValue}
            onEditChange={setSlValue}
            onSave={handleSlSave}
            saving={updateSl.isPending}
          />
          <Field label="Target 1" value={signal.tradePlan.target1} />
          <Field label="Target 2" value={signal.tradePlan.target2 ?? '—'} />
        </div>

        <div className="flex flex-wrap gap-3">
          {nextAction && (
            <button
              className="btn-buy"
              onClick={runNext}
              disabled={hookMap[nextAction.hook].isPending}
            >
              {nextAction.label}
            </button>
          )}
          {CAN_EXIT.includes(signal.status) && (
            <button className="btn-danger" onClick={() => setExitConfirm(true)} disabled={exitNow.isPending}>
              ⚠ EXIT NOW
            </button>
          )}
          {CAN_CANCEL.includes(signal.status) && (
            <button
              className="btn-ghost"
              onClick={() => signalId && cancel.mutate({ signalId })}
              disabled={cancel.isPending}
            >
              Cancel signal
            </button>
          )}
        </div>
      </div>

      {exitConfirm && (
        <div className="glass-strong p-6 border-sell/30">
          <div className="text-sell font-display font-semibold mb-2">Confirm emergency exit</div>
          <p className="text-sm text-muted mb-4">
            This immediately pushes a critical-priority EXIT NOW notification to every client who received this
            signal. This cannot be undone. Are you sure?
          </p>
          <div className="flex gap-3">
            <button className="btn-danger" onClick={handleExit}>
              Yes, exit now
            </button>
            <button className="btn-ghost" onClick={() => setExitConfirm(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-5">
        <div className="glass p-5">
          <h2 className="font-display text-sm font-semibold mb-3">Delivery status</h2>
          <div className="grid grid-cols-2 gap-3">
            <DeliveryStat label="Sent" value={delivery.sent} accent="buy" />
            <DeliveryStat label="Pending" value={delivery.pending} accent="info" />
            <DeliveryStat label="Failed" value={delivery.failed} accent="amber" />
            <DeliveryStat label="Dead letter" value={delivery.deadLetter} accent="sell" />
          </div>
        </div>

        <div className="glass p-5">
          <h2 className="font-display text-sm font-semibold mb-3">Event ledger</h2>
          <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
            {events.map((e) => (
              <div key={e.id} className="flex items-center justify-between text-sm px-2 py-1.5">
                <span className="text-ink/80">{e.eventType.replace(/_/g, ' ').toLowerCase()}</span>
                <span className="eyebrow">{new Date(e.createdAt).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  editable,
  editing,
  onEdit,
  editValue,
  onEditChange,
  onSave,
  saving,
}: {
  label: string;
  value: number | string;
  editable?: boolean;
  editing?: boolean;
  onEdit?: () => void;
  editValue?: string | null;
  onEditChange?: (v: string) => void;
  onSave?: () => void;
  saving?: boolean;
}) {
  return (
    <div className="glass-inset px-3 py-2.5">
      <div className="eyebrow mb-1">{label}</div>
      {editing ? (
        <div className="flex items-center gap-1.5">
          <input
            className="input figure py-1 text-sm"
            autoFocus
            value={editValue ?? ''}
            onChange={(e) => onEditChange?.(e.target.value)}
          />
          <button className="text-buy text-xs" onClick={onSave} disabled={saving}>
            ✓
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <span className="figure text-base">{value}</span>
          {editable && (
            <button className="text-muted hover:text-info text-xs" onClick={onEdit}>
              edit
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function DeliveryStat({ label, value, accent }: { label: string; value: number; accent: 'buy' | 'info' | 'amber' | 'sell' }) {
  const cls = { buy: 'text-buy', info: 'text-info', amber: 'text-amber', sell: 'text-sell' }[accent];
  return (
    <div className="glass-inset px-3 py-2.5">
      <div className="eyebrow mb-1">{label}</div>
      <div className={`figure text-lg ${cls}`}>{value}</div>
    </div>
  );
}
