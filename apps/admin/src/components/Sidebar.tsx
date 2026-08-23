import { NavLink } from 'react-router-dom';
import { UserButton } from '@clerk/clerk-react';
import { useAuditEvents, useClients, useSignals } from '../lib/queries';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: '◈' },
  { to: '/signals', label: 'Signals', icon: '⚡' },
  { to: '/clients', label: 'Clients', icon: '◎' },
  { to: '/audit', label: 'Audit Log', icon: '▤' },
  { to: '/health', label: 'System Health', icon: '◐' },
];

export function Sidebar() {
  return (
    <aside className="w-60 shrink-0 h-screen sticky top-0 flex flex-col p-4 gap-4">
      <div className="glass-strong px-4 py-4">
        <div className="font-display text-lg font-semibold tracking-tight">KARMA</div>
        <div className="eyebrow mt-0.5">Trading Signals · Admin</div>
      </div>

      <nav className="glass p-2 flex flex-col gap-1">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                isActive ? 'bg-white/[0.08] text-ink' : 'text-muted hover:bg-white/[0.05] hover:text-ink'
              }`
            }
          >
            <span className="text-base opacity-80">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto glass px-3 py-3 flex items-center justify-between">
        <span className="eyebrow">Session</span>
        <UserButton afterSignOutUrl="/sign-in" />
      </div>
    </aside>
  );
}

/** Thin horizontal ticker-style status rail shown at the top of the main content area. */
export function TickerRail() {
  const { data: signals } = useSignals();
  const { data: clients } = useClients();
  const { data: audit } = useAuditEvents();

  const liveSignals = signals?.filter((s) => !['CANCELLED', 'EXPIRED', 'EXITED', 'CLOSED', 'DRAFT'].includes(s.status)).length ?? '—';
  const activeMembers = clients?.filter((c) => c.status === 'ACTIVE').length ?? '—';
  const lastAction = audit?.[0];

  return (
    <div className="glass px-5 py-2.5 flex items-center gap-6 overflow-x-auto">
      <TickerStat label="Live Signals" value={liveSignals} />
      <span className="text-white/10">│</span>
      <TickerStat label="Active Members" value={activeMembers} />
      <span className="text-white/10">│</span>
      <TickerStat label="Total Clients" value={clients?.length ?? '—'} />
      {lastAction && (
        <>
          <span className="text-white/10">│</span>
          <span className="eyebrow whitespace-nowrap">
            Last action: <span className="text-ink/80 normal-case">{lastAction.action.replace(/_/g, ' ').toLowerCase()}</span>
          </span>
        </>
      )}
    </div>
  );
}

function TickerStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline gap-2 whitespace-nowrap">
      <span className="eyebrow">{label}</span>
      <span className="figure text-sm text-ink font-medium">{value}</span>
    </div>
  );
}
