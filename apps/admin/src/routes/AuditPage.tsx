import { useAuditEvents } from '../lib/queries';

export function AuditPage() {
  const { data: events, isLoading } = useAuditEvents();

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-display text-xl font-semibold">Audit Log</h1>
      <div className="glass overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="eyebrow border-b border-white/[0.06]">
              <th className="text-left font-medium px-5 py-3">Action</th>
              <th className="text-left font-medium px-5 py-3">Target</th>
              <th className="text-left font-medium px-5 py-3">When</th>
            </tr>
          </thead>
          <tbody>
            {events?.map((e) => (
              <tr key={e.id} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.03]">
                <td className="px-5 py-3 font-medium">{e.action.replace(/_/g, ' ').toLowerCase()}</td>
                <td className="px-5 py-3 text-muted figure text-xs">
                  {e.targetType}:{e.targetId.slice(0, 8)}
                </td>
                <td className="px-5 py-3 eyebrow">{new Date(e.createdAt).toLocaleString()}</td>
              </tr>
            ))}
            {!isLoading && events?.length === 0 && (
              <tr>
                <td colSpan={3} className="px-5 py-10 text-center text-muted text-sm">
                  No activity recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
