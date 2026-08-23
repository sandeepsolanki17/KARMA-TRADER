# Testing

## Backend — 47 test cases in the current source suite

The previously verified baseline was 46/46 against real Postgres + Redis. This revision adds one additional revoked-session device test; rerun the suite locally after installing dependencies and applying migrations 0001–0003.

```
cd apps/api && pnpm test
```

| File | Covers |
|---|---|
| `signalStateMachine.test.ts` | Pure state machine transitions, terminal-state rejection |
| `signals.service.test.ts` | Full signal lifecycle, idempotent retries, recipient snapshot freezing, EXIT NOW critical routing |
| `clientIsolation.test.ts` | Cross-client signal visibility, membership-based recipient inclusion/exclusion |
| `httpAuth.test.ts` | Unauthenticated/misconfigured-Clerk HTTP behavior (fails closed) |
| `authRbac.integration.test.ts` | Full HTTP-layer role/membership authorization + IDOR, with only Clerk's cryptographic verification mocked |
| `clerkWebhook.test.ts` | `user.created` -> client/admin linking logic, with only svix's signature check mocked |
| `devices.test.ts` | Single-active-device-per-client, server-side old-session rejection, and a genuine concurrent-request race test |

**What's mocked and why**: only third-party cryptographic verification (`@clerk/backend`'s `verifyToken`, `svix`'s `Webhook.verify`) — well-tested libraries that aren't our code. Everything downstream — Fastify routing, Postgres-backed authorization, membership gating, recipient isolation — runs for real against a live database in every test.

**What automated tests cannot cover** (see `docs/known-limitations.md` for the full list): actual Clerk cryptographic verification against Clerk's live servers, actual push delivery to a physical device, actual Angel One app behavior, actual browser-based OAuth redirects.

## Admin — typecheck + build verified, not click-through tested

```
cd apps/admin && pnpm typecheck && pnpm build
```
No headless browser is available in this project's build/verification environment, so UI interaction (does clicking EXIT NOW actually show the confirmation dialog, etc.) has not been automatedly tested — only that the app compiles, builds a real production bundle, and the dev server serves real content correctly.

## Client — typecheck + real Expo export verified

```
cd apps/client && pnpm typecheck
npx expo export -p web
```
`expo export` performs real bundling and static rendering (not just a type check) — verified to produce a working static build multiple times through this project's development. This is the closest verification available without a physical device or simulator.

## Running tests as part of CI (not yet wired to a specific CI provider)

The commands above are what any CI provider would run. `apps/api`'s `pnpm test` needs a real Postgres and Redis available at the URLs in `apps/api/.env.test` — either service containers (most CI providers support this natively) or the provided `docker-compose.yml`.
