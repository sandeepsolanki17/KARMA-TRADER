export function ConfigMissingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="glass-strong max-w-lg w-full p-8">
        <div className="eyebrow text-amber mb-3">Setup required</div>
        <h1 className="font-display text-2xl font-semibold mb-3">Clerk isn't configured yet</h1>
        <p className="text-sm text-muted leading-relaxed mb-4">
          This admin console needs a real Clerk publishable key before anyone can sign in. Create a Clerk
          application, then set <code className="figure text-ink bg-black/30 px-1.5 py-0.5 rounded">
            VITE_CLERK_PUBLISHABLE_KEY
          </code>{' '}
          in <code className="figure text-ink bg-black/30 px-1.5 py-0.5 rounded">apps/admin/.env</code>, and the
          matching <code className="figure text-ink bg-black/30 px-1.5 py-0.5 rounded">CLERK_SECRET_KEY</code> in{' '}
          <code className="figure text-ink bg-black/30 px-1.5 py-0.5 rounded">apps/api/.env</code>.
        </p>
        <p className="text-xs text-muted/80 leading-relaxed">
          Everything downstream — sign-in, client invitations, session verification — is already wired to Clerk's
          real APIs. This screen only appears because no credentials have been provided yet.
        </p>
      </div>
    </div>
  );
}
