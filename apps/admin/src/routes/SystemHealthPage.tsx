import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

interface ReadyResponse {
  ok: boolean;
  checks: { postgres: boolean; redis: boolean; clerkConfigured: boolean; expoPushConfigured: boolean; angelOneConfigured: boolean };
}
interface BrokerHealthResponse {
  broker: { broker: string; configured: boolean; reachable: boolean | 'unknown'; detail: string };
}

export function SystemHealthPage() {
  const { data: ready } = useQuery({
    queryKey: ['health-ready'],
    queryFn: () => fetch(`${import.meta.env.VITE_API_BASE_URL}/health/ready`).then((r) => r.json() as Promise<ReadyResponse>),
    refetchInterval: 15_000,
  });
  const { data: broker } = useQuery({
    queryKey: ['broker-health'],
    queryFn: () => api.get<BrokerHealthResponse>('/admin/broker/health'),
    refetchInterval: 30_000,
  });

  const rows = [
    { label: 'PostgreSQL', ok: ready?.checks.postgres },
    { label: 'Redis / BullMQ', ok: ready?.checks.redis },
    { label: 'Clerk configured', ok: ready?.checks.clerkConfigured },
    { label: 'Expo push configured', ok: ready?.checks.expoPushConfigured },
  ];

  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      <h1 className="font-display text-xl font-semibold">System Health</h1>

      <div className="glass p-5">
        <h2 className="font-display text-sm font-semibold mb-3">Core services</h2>
        <div className="flex flex-col gap-2">
          {rows.map((row) => (
            <div key={row.label} className="glass-inset px-4 py-2.5 flex items-center justify-between">
              <span className="text-sm">{row.label}</span>
              <StatusDot ok={row.ok} />
            </div>
          ))}
        </div>
      </div>

      <div className="glass p-5">
        <h2 className="font-display text-sm font-semibold mb-3">Angel One broker</h2>
        <div className="glass-inset px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="eyebrow">Status</span>
            <StatusDot ok={broker?.broker.reachable === true} unknown={broker?.broker.reachable === 'unknown'} />
          </div>
          <p className="text-xs text-muted leading-relaxed">{broker?.broker.detail ?? 'Loading…'}</p>
        </div>
      </div>
    </div>
  );
}

function StatusDot({ ok, unknown }: { ok?: boolean; unknown?: boolean }) {
  if (unknown) return <span className="figure text-xs text-amber">NOT CONFIGURED</span>;
  return (
    <span className={`figure text-xs ${ok ? 'text-buy' : 'text-sell'}`}>{ok ? 'OK' : 'DOWN'}</span>
  );
}
