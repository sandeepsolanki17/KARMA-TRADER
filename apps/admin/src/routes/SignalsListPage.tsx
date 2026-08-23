import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSignals } from '../lib/queries';
import { StatusBadge } from '../components/StatusBadge';
import type { SignalStatus } from '@karma/types';

const FILTERS: { label: string; statuses: SignalStatus[] | null }[] = [
  { label: 'All', statuses: null },
  { label: 'Live', statuses: ['PUBLISHED', 'ENTRY_HIT', 'T1_HIT', 'T2_HIT', 'T3_HIT'] },
  { label: 'Draft', statuses: ['DRAFT'] },
  { label: 'Closed', statuses: ['CLOSED', 'CANCELLED', 'EXPIRED', 'EXITED'] },
];

export function SignalsListPage() {
  const { data: signals, isLoading } = useSignals();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>(FILTERS[0]!);

  const filtered = signals?.filter((s) => !filter.statuses || filter.statuses.includes(s.status));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div className="glass p-1 inline-flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.label}
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                f.label === filter.label ? 'bg-white/[0.09] text-ink' : 'text-muted hover:text-ink'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Link to="/signals/new" className="btn-primary">
          + New Signal
        </Link>
      </div>

      <div className="glass overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="eyebrow border-b border-white/[0.06]">
              <th className="text-left font-medium px-5 py-3">Instrument</th>
              <th className="text-left font-medium px-5 py-3">Side</th>
              <th className="text-left font-medium px-5 py-3">Entry</th>
              <th className="text-left font-medium px-5 py-3">SL</th>
              <th className="text-left font-medium px-5 py-3">Status</th>
              <th className="text-left font-medium px-5 py-3">Created</th>
            </tr>
          </thead>
          <tbody>
            {filtered?.map((s) => (
              <tr key={s.id} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.03]">
                <td className="px-5 py-3">
                  <Link to={`/signals/${s.id}`} className="font-medium hover:text-info">
                    {s.instrumentDisplayName}
                  </Link>
                </td>
                <td className="px-5 py-3">
                  <span className={s.side === 'BUY' ? 'text-buy' : 'text-sell'}>{s.side}</span>
                </td>
                <td className="px-5 py-3 figure">{s.tradePlan.entry}</td>
                <td className="px-5 py-3 figure">{s.tradePlan.stopLoss}</td>
                <td className="px-5 py-3">
                  <StatusBadge status={s.status} />
                </td>
                <td className="px-5 py-3 eyebrow">{new Date(s.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
            {!isLoading && filtered?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-muted text-sm">
                  No signals in this view.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
