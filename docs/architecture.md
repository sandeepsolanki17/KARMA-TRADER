# Architecture overview

## Signal lifecycle (state machine)

`packages/types/src/signalStateMachine.ts` is the single source of truth — an explicit allow-list of `(currentStatus, event) -> nextStatus`. Every mutation in `apps/api/src/modules/signals/signals.service.ts` goes through `applyTransition()`; nothing sets `status` directly anywhere else in the codebase.

```
DRAFT -> PUBLISHED -> ENTRY_HIT -> T1_HIT -> T2_HIT -> T3_HIT -> CLOSED
              |            |          |         |
              |            |          |         +--> EXIT_NOW -> EXITED
              |            |          +--> EXIT_NOW -> EXITED
              |            +--> EXIT_NOW -> EXITED
              |            +--> EXPIRED
              +--> CANCELLED
```
Terminal states (`CANCELLED`, `EXPIRED`, `EXITED`, `CLOSED`) reject every further transition.

## Every signal mutation is one transaction

1. Row-locked read (`FOR UPDATE`) of the current signal.
2. Idempotency check against `signal_events` (signal_id, idempotency_key) — a retried request with the same key is a safe no-op, returns current state.
3. State machine transition (throws `InvalidSignalTransitionError` if illegal).
4. Column update + immutable event row insert into `signal_events` (append-only, never updated/deleted — this is both the audit trail and the idempotency mechanism).
5. **Publish only**: snapshot the current set of clients with `ACTIVE` status + `ACTIVE` unexpired membership into `signal_recipients` — frozen at that moment, never recalculated later.
6. Notification job rows inserted (one per client x device pair).
7. Audit log entry.
8. Transaction commits.
9. **Only after commit**, BullMQ jobs are enqueued to Redis — a DB transaction is never held open across a network call.

## Notification pipeline

Two physically separate BullMQ queues (`apps/api/src/modules/notifications/queue.ts`):
- `notifications-normal` — publish, SL/target updates, T1/T2/T3 hits.
- `notifications-critical` — EXIT NOW only.

They're separate queues, not a priority field on one queue, specifically so a backlog of routine notifications can never delay an emergency exit. Both are consumed by workers running inside the API's own process (`apps/api/src/modules/notifications/worker.ts`), started from `server.ts` — there's no separate worker deployment.

Delivery: `apps/api/src/modules/notifications/expoPush.ts` wraps Expo's push SDK. A malformed token or an Expo-reported `DeviceNotRegistered` error auto-revokes that device row — a dead token can never accumulate silent failed attempts forever.

## Authentication & authorization

Clerk owns identity/session verification. Our backend owns everything downstream:
- `apps/api/src/auth/clerk.ts` — verifies the bearer token, sets `request.auth.clerkUserId` + `request.auth.sessionId`. Fails closed (500 `server_misconfigured`) if `CLERK_SECRET_KEY` is a placeholder — never silently trusts a token.
- `apps/api/src/auth/rbac.ts` — `requireAdmin` / `requireClient` / `requireActiveMembership` preHandlers, looking up role/status/membership against our own `users`/`clients`/`memberships` tables.
- `apps/api/src/modules/webhooks/clerkWebhook.routes.ts` — links a Clerk `user.created` event to a pending client invite (matched by lowercased email) or to a new admin user (matched by `public_metadata.role === 'ADMIN'`). An email with no matching invite is never auto-provisioned.

### Client authentication method

Email OTP (Clerk's `email_code` strategy) or Google SSO (Clerk's `useSSO`/`oauth_google`) only — no password field, no SMS OTP, anywhere in the client app (`apps/client/app/sign-in.tsx`).

### One active device per client

Enforced at the database level, not just in application code: `infra/postgres/migrations/0002_single_device_per_client.sql` adds a partial unique index (`client_id WHERE revoked_at IS NULL`) — Postgres itself rejects a second concurrently-active device row for the same client. `apps/api/src/modules/devices/deviceSession.service.ts` locks the client's device row, revokes any existing active device (DB-side immediately; Clerk session revocation is best-effort), and registers the new one — race-safety verified with a genuine concurrent-request test (`apps/api/src/test/devices.test.ts`), not just reasoned about. This is scoped strictly by `client_id` — different clients' devices are fully independent.

## Client isolation

`signal_recipients` (frozen at publish) is the only source of truth for "can this client see this signal." `GET /client/signals/:id` returns 404 (not 403) for a non-recipient — existence isn't confirmed to clients who were never entitled. Verified with real HTTP-layer IDOR tests (`apps/api/src/test/authRbac.integration.test.ts`, `clientIsolation.test.ts`).
