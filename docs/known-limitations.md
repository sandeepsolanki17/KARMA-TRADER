# Known limitations

Grouped by cause, not blurred together.

## Cannot be verified inside this build environment (no browser, no phone, no live external credentials)

- Real Clerk cryptographic session verification against Clerk's live servers (needs a real `CLERK_SECRET_KEY` + network access neither available here — our authorization logic on top of a verified identity is tested; Clerk's own token verification is Clerk's tested code, not re-proven here).
- Any real browser-based Clerk sign-in or Google OAuth redirect completing end-to-end.
- Real Expo push delivery to a physical device — permission prompts, token generation, notification receipt, tap-to-navigate, all only verifiable by you, per `docs/device-testing.md`.
- Real Clerk webhook delivery (needs a real Clerk instance + public tunnel).
- Real single-device-per-client behavior observed on two physical phones (the server-side session-rejection logic and concurrent-request race are automated; the two-phone experience still needs real devices).
- Angel One's manual-order review on a real device — see `docs/angel-one.md`. No undocumented Angel One deep-link is attempted or required.
- Actual EAS build execution (`eas build`) — requires a real EAS account and runs on Expo's build infrastructure, not locally.

## Deliberately deferred, with reasoning documented

- `@clerk/clerk-expo` to `@clerk/expo` migration — the new package requires Expo SDK >=54; this project is pinned to SDK 51 after an earlier real dependency-resolution failure. See `docs/clerk-expo-migration-deferred.md`.
- Angel One Publisher API / automated order placement — not built, on purpose, to avoid any path toward automatic trade execution. See `docs/angel-one.md`.

## Not attempted this pass, scope was too large to do honestly within budget

- Exhaustive UI polish: tablet-specific layouts, reduced-motion handling, full offline/reconnect UX beyond React Query's default retry behavior, keyboard shortcuts in the admin app.
- A dedicated admin "Settings" screen (system configuration currently lives entirely in `.env` files, which is functional but not exposed as an in-app settings UI).
- CI pipeline configuration for a specific provider (GitHub Actions, etc.) — the commands in `docs/testing.md` are what such a pipeline would run, but no `.github/workflows` file exists yet.
- Automatic re-enqueue of lost BullMQ jobs after a Redis restart (noted in `docs/deployment.md`'s backup section).

## Explicitly NOT limitations — things that are genuinely done

- The signal state machine, idempotency, recipient isolation, IDOR protection, and single-device race-safety are all tested against a real database, not mocked or assumed.
- The admin and client apps both produce real, verified production builds (not just passing typecheck) — see `docs/testing.md` for exactly what "verified" means in each case.
