# KARMA Trading Platform

A trading-signals platform: an admin console publishes signals with a full trade plan (entry/stop-loss/targets), and authorized clients receive them as real-time push notifications on a mobile app, with an emergency EXIT NOW path that bypasses routine notification queuing.

## Architecture

```
apps/
  api/       Fastify backend + BullMQ notification workers (same process)
  admin/     React + Vite admin console (Clerk auth)
  client/    Expo/React Native client app (Clerk auth, Email OTP / Google only)
  landing/   Static marketing/APK-distribution page (no build step)
packages/
  types/     Shared TypeScript types, Zod contracts, the signal state machine
infra/
  postgres/migrations/   Plain SQL migrations, applied in order
docs/        Everything below is documented in detail here
```

Modular monolith + worker-in-process — the notification workers run inside the API's own Node process, not as a separate deployment (see `apps/api/src/server.ts`).

## Prerequisites

- Node.js 20+, pnpm
- PostgreSQL 16 (or compatible)
- Redis 7 (or compatible)
- A Clerk application (free tier is fine) — see `docs/device-testing.md` for exact setup steps
- For real push notifications: a free Expo/EAS account

## Quick start (local dev)

```bash
# 1. Start Postgres + Redis
docker compose up -d

# 2. Install everything
pnpm install

# 3. Build the shared types package (other apps import its compiled output)
pnpm --filter @karma/types build

# 4. Apply database migrations
cd apps/api && pnpm migrate && cd ../..

# 5. Fill in real Clerk keys (see docs/device-testing.md) in:
#    apps/api/.env, apps/admin/.env, apps/client/.env

# 6. Run everything
cd apps/api && pnpm dev      # terminal 1 — API + worker
cd apps/admin && pnpm dev    # terminal 2 — admin web
cd apps/client && npx expo start   # terminal 3 — client, scan QR with Expo Go
```

## First admin account

Nothing auto-promotes anyone to ADMIN. After signing in once via Clerk to get a real `user_id`:
```sql
INSERT INTO users (clerk_user_id, role, status) VALUES ('user_xxxxxxxxxxxx', 'ADMIN', 'ACTIVE');
```

## Testing

```bash
cd apps/api && pnpm test
```
47 backend test cases in the current source suite; the previous 46-test baseline was verified against a real Postgres/Redis instance — the state machine, idempotency, recipient-snapshot client isolation, IDOR protection, server-side one-device session rejection, race safety, and webhook linking logic are all exercised for real. See `docs/testing.md` for what is and isn't covered, and why.

## Documentation index

- `docs/device-testing.md` — exact real-device push notification test procedure
- `docs/deployment.md` — production deployment, Docker, migrations, backups
- `docs/apk-distribution.md` — Android APK build/signing/distribution via EAS
- `docs/angel-one.md` — broker integration scope and honest limitations
- `docs/architecture.md` — signal state machine, notification pipeline, auth model
- `docs/clerk-expo-migration-deferred.md` — why `@clerk/expo` migration is deferred
- `docs/known-limitations.md` — what's genuinely unverified or incomplete, and why

## Key design decisions worth knowing before you change anything

- **Signal mutations are all-or-nothing transactions**: lock row → idempotency check → state machine transition → immutable event log entry → (publish only) freeze recipient snapshot → notification job rows → audit log, all in one DB transaction, with the BullMQ enqueue happening *after* commit. See `apps/api/src/modules/signals/signals.service.ts`.
- **Recipient set is frozen at publish time.** A client's membership lapsing after a signal was published does not retroactively revoke their access to that signal's history — but it does exclude them from *future* signals. This is a deliberate product decision, not an oversight.
- **EXIT NOW uses a physically separate BullMQ queue**, not just a priority field, so a backlog of routine notifications can never delay an emergency exit.
- **One active device per client, enforced at the database level** via a partial unique index (`infra/postgres/migrations/0002_single_device_per_client.sql`), not just application logic — verified race-safe with a concurrent-request test.
- **Client auth is Email OTP or Google SSO only** — no password field, no SMS OTP anywhere in the client app.
