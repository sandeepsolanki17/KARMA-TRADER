import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useClients, useInviteClient } from '../lib/queries';
import { StatusBadge } from '../components/StatusBadge';

export function ClientsListPage() {
  const { data: clients, isLoading } = useClients();
  const [showInvite, setShowInvite] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-semibold">Clients</h1>
        <button className="btn-primary" onClick={() => setShowInvite((v) => !v)}>
          + Invite client
        </button>
      </div>

      {showInvite && <InviteForm onDone={() => setShowInvite(false)} />}

      <div className="glass overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="eyebrow border-b border-white/[0.06]">
              <th className="text-left font-medium px-5 py-3">Name</th>
              <th className="text-left font-medium px-5 py-3">Email</th>
              <th className="text-left font-medium px-5 py-3">Status</th>
              <th className="text-left font-medium px-5 py-3">Joined</th>
            </tr>
          </thead>
          <tbody>
            {clients?.map((c) => (
              <tr key={c.id} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.03]">
                <td className="px-5 py-3">
                  <Link to={`/clients/${c.id}`} className="font-medium hover:text-info">
                    {c.name}
                  </Link>
                </td>
                <td className="px-5 py-3 text-muted">{c.invitedEmail}</td>
                <td className="px-5 py-3">
                  <StatusBadge status={c.status} />
                </td>
                <td className="px-5 py-3 eyebrow">{c.joinedAt ? new Date(c.joinedAt).toLocaleDateString() : 'Pending invite'}</td>
              </tr>
            ))}
            {!isLoading && clients?.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-10 text-center text-muted text-sm">
                  No clients yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InviteForm({ onDone }: { onDone: () => void }) {
  const invite = useInviteClient();
  const [form, setForm] = useState({ name: '', email: '', phone: '' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await invite.mutateAsync({
      name: form.name,
      email: form.email,
      phone: form.phone || null,
      preferredBroker: 'ANGEL_ONE',
    });
    onDone();
  };

  return (
    <form onSubmit={handleSubmit} className="glass p-5 flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="label">Name</label>
          <input
            className="input"
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </div>
        <div>
          <label className="label">Email</label>
          <input
            className="input"
            required
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
        </div>
        <div>
          <label className="label">Phone (optional)</label>
          <input
            className="input"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          />
        </div>
      </div>
      {invite.isError && (
        <div className="text-sm text-sell bg-sell/10 border border-sell/20 rounded-xl px-3 py-2">
          {(invite.error as any)?.message ?? 'Failed to invite client.'}
        </div>
      )}
      <div className="flex justify-end gap-3">
        <button type="button" className="btn-ghost" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={invite.isPending}>
          {invite.isPending ? 'Sending invite…' : 'Send Clerk invitation'}
        </button>
      </div>
    </form>
  );
}
