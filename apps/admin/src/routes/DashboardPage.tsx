import { Link } from 'react-router-dom';
import { useAuditEvents, useClients, useSignals } from '../lib/queries';
import { StatusBadge } from '../components/StatusBadge';

export function DashboardPage() {
  const { data: signals, isLoading: signalsLoading } = useSignals();
  const { data: clients, isLoading: clientsLoading } = useClients();
  const { data: audit } = useAuditEvents();

  const liveSignals = signals?.filter((s) => !['CANCELLED', 'EXPIRED', 'EXITED', 'CLOSED', 'DRAFT'].includes(s.status)) ?? [];
  const draftSignals = signals?.filter((s) => s.status === 'DRAFT') ?? [];
  const activeMembers = clients?.filter((c) => c.status === 'ACTIVE') ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-3 gap-5">
        <MetricCard label="Live Signals" value={liveSignals.length} loading={signalsLoading} accent="info" />
        <MetricCard label="Draft Signals" value={draftSignals.length} loading={signalsLoading} accent="muted" />
        <MetricCard label="Active Members" value={activeMembers.length} loading={clientsLoading} accent="buy" />
      </div>

      <div className="grid grid-cols-2 gap-5">
        <div className="glass p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-sm font-semibold">Recent Signals</h2>
            <Link to="/signals" className="eyebrow text-info hover:underline">
              View all →
            </Link>
          </div>
          <div className="flex flex-col gap-1">
            {signals?.slice(0, 6).map((s) => (
              <Link
                key={s.id}
                to={`/signals/${s.id}`}
                className="glass-hover flex items-center justify-between rounded-xl px-3 py-2.5 -mx-1"
              >
                <div>
                  <div className="text-sm font-medium">{s.instrumentDisplayName}</div>
                  <div className="eyebrow mt-0.5">
                    {s.side} · Entry {s.tradePlan.entry}
                  </div>
                </div>
                <StatusBadge status={s.status} />
              </Link>
            ))}
            {signals?.length === 0 && <p className="text-sm text-muted py-4 text-center">No signals yet.</p>}
          </div>
        </div>

        <div className="glass p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-sm font-semibold">Recent Activity</h2>
            <Link to="/audit" className="eyebrow text-info hover:underline">
              View all →
            </Link>
          </div>
          <div className="flex flex-col gap-1">
            {audit?.slice(0, 8).map((e) => (
              <div key={e.id} className="flex items-center justify-between rounded-xl px-3 py-2 -mx-1 text-sm">
                <span className="text-ink/80">{e.action.replace(/_/g, ' ').toLowerCase()}</span>
                <span className="eyebrow">{new Date(e.createdAt).toLocaleTimeString()}</span>
              </div>
            ))}
            {audit?.length === 0 && <p className="text-sm text-muted py-4 text-center">No activity yet.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  loading,
  accent,
}: {
  label: string;
  value: number;
  loading: boolean;
  accent: 'info' | 'buy' | 'muted';
}) {
  const accentClass = { info: 'text-info', buy: 'text-buy', muted: 'text-ink' }[accent];
  return (
    <div className="glass p-5">
      <div className="eyebrow mb-2">{label}</div>
      <div className={`font-display text-3xl font-semibold figure ${accentClass}`}>
        {loading ? '—' : value}
      </div>
    </div>
  );
}
