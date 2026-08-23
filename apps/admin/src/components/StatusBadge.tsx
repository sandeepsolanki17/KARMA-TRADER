import type { AccountStatus, MembershipStatus, SignalStatus } from '@karma/types';

type Status = SignalStatus | AccountStatus | MembershipStatus;

const STATUS_STYLES: Record<string, { dot: string; text: string }> = {
  DRAFT: { dot: 'bg-muted', text: 'text-muted' },
  PUBLISHED: { dot: 'bg-info shadow-[0_0_8px_rgba(91,157,255,0.8)]', text: 'text-info' },
  ENTRY_HIT: { dot: 'bg-info shadow-[0_0_8px_rgba(91,157,255,0.8)]', text: 'text-info' },
  T1_HIT: { dot: 'bg-buy shadow-[0_0_8px_rgba(61,220,132,0.8)]', text: 'text-buy' },
  T2_HIT: { dot: 'bg-buy shadow-[0_0_8px_rgba(61,220,132,0.8)]', text: 'text-buy' },
  T3_HIT: { dot: 'bg-buy shadow-[0_0_8px_rgba(61,220,132,0.8)]', text: 'text-buy' },
  CLOSED: { dot: 'bg-muted', text: 'text-muted' },
  CANCELLED: { dot: 'bg-muted', text: 'text-muted' },
  EXPIRED: { dot: 'bg-amber', text: 'text-amber' },
  EXITED: { dot: 'bg-sell shadow-[0_0_8px_rgba(255,107,91,0.8)]', text: 'text-sell' },
  ACTIVE: { dot: 'bg-buy shadow-[0_0_8px_rgba(61,220,132,0.8)]', text: 'text-buy' },
  SUSPENDED: { dot: 'bg-amber', text: 'text-amber' },
  DEACTIVATED: { dot: 'bg-sell', text: 'text-sell' },
  CANCELLED_MEMBERSHIP: { dot: 'bg-muted', text: 'text-muted' },
};

export function StatusBadge({ status }: { status: Status }) {
  const style = STATUS_STYLES[status] ?? { dot: 'bg-muted', text: 'text-muted' };
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider2">
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      <span className={style.text}>{status.replace(/_/g, ' ')}</span>
    </span>
  );
}
