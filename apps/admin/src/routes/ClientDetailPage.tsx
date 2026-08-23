import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useClient, useExtendMembership, useMarkPayment, useSetClientStatus } from '../lib/queries';
import { StatusBadge } from '../components/StatusBadge';

const EXTEND_PRESETS = [7, 30, 90, 365];

export function ClientDetailPage() {
  const { clientId } = useParams();
  const { data, isLoading } = useClient(clientId);
  const extend = useExtendMembership();
  const markPayment = useMarkPayment();
  const setStatus = useSetClientStatus();
  const [customDays, setCustomDays] = useState('');
  const [markPaid, setMarkPaid] = useState(true);

  if (isLoading || !data) return <div className="text-muted text-sm">Loading…</div>;

  const { client, membership } = data;
  const expiresAt = membership ? new Date(membership.expiresAt) : null;
  const isExpired = expiresAt ? expiresAt.getTime() < Date.now() : true;

  const doExtend = (days: number) => {
    if (!clientId) return;
    extend.mutate({ clientId, days, markPaymentReceived: markPaid });
  };

  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      <div className="glass p-6">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h1 className="font-display text-xl font-semibold">{client.name}</h1>
            <div className="eyebrow mt-1">{client.preferredBroker}</div>
          </div>
          <StatusBadge status={client.status} />
        </div>

        <div className="flex gap-3 mb-2">
          {client.status !== 'ACTIVE' && (
            <button className="btn-buy" onClick={() => clientId && setStatus.mutate({ clientId, action: 'activate' })}>
              Activate
            </button>
          )}
          {client.status !== 'SUSPENDED' && (
            <button className="btn-ghost" onClick={() => clientId && setStatus.mutate({ clientId, action: 'suspend' })}>
              Suspend
            </button>
          )}
          {client.status !== 'DEACTIVATED' && (
            <button className="btn-danger" onClick={() => clientId && setStatus.mutate({ clientId, action: 'deactivate' })}>
              Deactivate
            </button>
          )}
        </div>
      </div>

      <div className="glass p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-sm font-semibold">Membership</h2>
          <StatusBadge status={membership?.status ?? 'EXPIRED'} />
        </div>

        <div className="glass-inset px-4 py-3 mb-5">
          <div className="eyebrow mb-1">{isExpired ? 'Expired' : 'Expires'}</div>
          <div className="figure text-lg">{expiresAt ? expiresAt.toLocaleString() : '—'}</div>
        </div>

        <div className="flex items-center gap-2 mb-3">
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={markPaid} onChange={(e) => setMarkPaid(e.target.checked)} />
            Mark payment received with this extension
          </label>
        </div>

        <div className="flex flex-wrap gap-2 mb-3">
          {EXTEND_PRESETS.map((days) => (
            <button key={days} className="btn-primary" onClick={() => doExtend(days)} disabled={extend.isPending}>
              +{days}d
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <input
            className="input w-28"
            type="number"
            placeholder="Days"
            value={customDays}
            onChange={(e) => setCustomDays(e.target.value)}
          />
          <button
            className="btn-ghost"
            disabled={!customDays || extend.isPending}
            onClick={() => doExtend(Number(customDays))}
          >
            Extend custom
          </button>
          <button
            className="btn-ghost ml-auto"
            disabled={markPayment.isPending}
            onClick={() => clientId && markPayment.mutate({ clientId })}
          >
            Mark payment only (no extension)
          </button>
        </div>
      </div>
    </div>
  );
}
