# Deployment

## Architecture

Modular monolith + worker-in-process, exactly as built:
- **API** (`apps/api`) — Fastify, also runs the BullMQ notification workers in the same Node process (see `apps/api/src/server.ts`). No separate worker deployment needed unless you outgrow this later.
- **Admin** (`apps/admin`) — static Vite build, deploy anywhere that serves static files.
- **Client** (`apps/client`) — Expo/React Native, distributed as an Android APK (see `docs/apk-distribution.md`) and iOS-ready.
- **Landing** (`apps/landing`) — a single static `index.html`, no build step.
- **Postgres** and **Redis** — external managed services in production; `docker-compose.yml` provides them for local dev only.

## Environment variables — production checklist

`apps/api/.env` (or your host's secret manager — never commit real values):
```
NODE_ENV=production
PORT=4000
LOG_LEVEL=info
CORS_ORIGIN=https://your-admin-domain.com
DATABASE_URL=postgres://...        # managed Postgres connection string
REDIS_URL=redis://...              # managed Redis connection string
CLERK_SECRET_KEY=sk_live_...
CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_AUTHORIZED_PARTIES=https://your-admin-domain.com
CLERK_WEBHOOK_SECRET=whsec_...
EXPO_ACCESS_TOKEN=...              # optional, raises Expo's push rate limit
ANGEL_ONE_API_KEY=...              # optional — only needed for broker health/instrument features
ANGEL_ONE_CLIENT_CODE=...
ANGEL_ONE_PUBLISHER_APP_ID=...
```

`apps/admin/.env` (baked in at build time — Vite compiles these into the bundle):
```
VITE_CLERK_PUBLISHABLE_KEY=pk_live_...
VITE_API_BASE_URL=https://your-api-domain.com
```

`apps/client/.env` (baked in at EAS build time — see `apps/client/eas.json`'s `production.env`):
```
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
EXPO_PUBLIC_API_BASE_URL=https://your-api-domain.com
```

Note: Clerk's live keys (`pk_live_`/`sk_live_`) are a separate Clerk environment from your `pk_test_`/`sk_test_` dev keys — set this up in the Clerk dashboard when you're ready for production, not before.

## Database migrations

Migrations are plain SQL files in `infra/postgres/migrations/`, applied in filename order and tracked in a `schema_migrations` table (see `apps/api/src/db/migrate.ts`). Run once per deploy, before starting the API:
```
cd apps/api && pnpm migrate
```
Never edit a migration file that has run anywhere outside local dev — add a new numbered file instead (`0003_...sql`).

## API deployment

Build and run via the provided `Dockerfile`:
```
docker build -t karma-api -f apps/api/Dockerfile .
docker run -p 4000:4000 --env-file apps/api/.env karma-api
```
Any container host works (Fly.io, Render, Railway, a plain VM with Docker). Health checks: `GET /health` (liveness — always 200 once the process is up) and `GET /health/ready` (readiness — checks real Postgres/Redis connectivity, returns 503 if either is down; use this for your load balancer's readiness probe, not `/health`).

## Admin deployment

```
cd apps/admin && pnpm build
```
Produces `apps/admin/dist/` — a static site. Deploy to Vercel, Netlify, Cloudflare Pages, or any static host. Set `VITE_CLERK_PUBLISHABLE_KEY` and `VITE_API_BASE_URL` as build-time environment variables on whichever platform you use — they're compiled into the bundle, not read at runtime.

## Client (Android APK) deployment

See `docs/apk-distribution.md` in full. Summary: `npx eas build --platform android --profile production-apk` produces a signed APK; host that file anywhere with a stable HTTPS URL and point the landing page's download button at it.

## Landing page deployment

`apps/landing/index.html` is a single static file with no build step — deploy it to any static host (same options as Admin). Before deploying, replace the placeholder APK URL in its inline `<script>` tag with the real hosted APK link.

## Logging

Structured JSON logs via Pino (`apps/api`), human-readable in development (`pino-pretty`), machine-readable JSON in production (`NODE_ENV=production` disables the pretty transport — see `apps/api/src/app.ts`). Pipe container stdout to whatever log aggregator your host provides.

## Backup & recovery

Standard Postgres practices — this project doesn't do anything unusual with the database:
- **Backup**: `pg_dump` on a schedule, or your managed Postgres provider's automated backups (Neon, Supabase, RDS, etc. all provide this — prefer that over rolling your own).
- **Recovery**: restore the dump into a fresh database, then run `pnpm migrate` to confirm `schema_migrations` matches — if the dump predates a migration, the migration runner will apply it forward automatically.
- **Redis**: BullMQ job state is not critical historical data — a Redis restart loses in-flight notification jobs, but the `notification_jobs` table in Postgres is the durable source of truth for delivery status; a lost queue only means jobs need re-enqueueing, not that history is lost. There's no built-in re-enqueue-from-Postgres sweep currently — if this matters for your operations, that's a reasonable small addition later.

## What's real vs. what needs your infrastructure choices

| Piece | Status |
|---|---|
| Dockerfile, docker-compose (local dev), migration workflow | Real, present in this repo |
| Health check endpoints | Real, tested |
| Which host/provider to actually use | Your choice — not prescribed here beyond "any standard container/static host works" |
| Live Clerk production keys, live Angel One credentials | Yours to provide, never committed |
