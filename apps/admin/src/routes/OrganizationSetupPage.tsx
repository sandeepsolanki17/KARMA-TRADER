import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';
import { useClerk } from '@clerk/clerk-react';
import { api } from '../lib/api';

export function OrganizationSetupPage() {
  const { signOut } = useClerk();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');

  const createOrg = useMutation({
    mutationFn: async (data: { name: string; slug: string }) => {
      const res = await api.post<{ organization: { id: string; name: string } }>('/admin/organization', data);
      return res.organization;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['current-org'] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !slug) return;
    createOrg.mutate({ name, slug: slug.toLowerCase() });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 p-4">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl p-8 shadow-2xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white mb-2">Welcome to KARMA</h1>
            <p className="text-zinc-400">Set up your organization to get started.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {createOrg.isError && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {(createOrg.error as any)?.response?.data?.message || 'Failed to create organization. Please try again.'}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Organization Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slug || slug === name.toLowerCase().replace(/[^a-z0-9]/g, '-')) {
                  setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-'));
                }
              }}
              placeholder="e.g. Alpha Traders"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Organization Slug</label>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder="e.g. alpha-traders"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              required
            />
            <p className="text-xs text-zinc-500 mt-1.5">Used for internal identification. Letters, numbers, and hyphens only.</p>
          </div>

          <div className="pt-4 flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => signOut()}
              className="text-sm text-zinc-400 hover:text-white flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
            <button
              type="submit"
              disabled={createOrg.isPending || !name || !slug}
              className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold py-2.5 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {createOrg.isPending ? 'Creating...' : 'Create Organization'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
