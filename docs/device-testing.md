# Real-device push notification and device-security test — exact procedure

This is the highest-priority remaining verification. Nothing in this doc can
be executed from the Claude.ai sandbox — no phone, no browser, no live
Clerk secret. Every step below is something you run yourself, in order.

## Part A — one-time setup

### A1. Clerk keys

`apps/api/.env` — you fill these in yourself, locally, in a text editor (never in chat):
```
CLERK_SECRET_KEY=sk_test_...
CLERK_WEBHOOK_SECRET=whsec_...     # from A3 below
```
The publishable key is already correctly set in all three `.env` files.

### A2. Find your LAN IP

- macOS: `ipconfig getifaddr en0`
- Windows: `ipconfig` -> IPv4 Address under your Wi-Fi adapter
- Linux: `hostname -I`

Put it in `apps/client/.env`:
```
EXPO_PUBLIC_API_BASE_URL=http://<YOUR_LAN_IP>:4000
```
`apps/admin/.env` stays `http://localhost:4000` (admin runs in your laptop's own browser).

### A3. Clerk webhook (required — without it, invited clients never link to their account)

```
ngrok http 4000
```
Clerk dashboard -> **Configure -> Webhooks -> Add Endpoint**:
- URL: `https://<your-ngrok-subdomain>.ngrok-free.app/webhooks/clerk`
- Event: `user.created` only
- Copy the **Signing Secret** into `CLERK_WEBHOOK_SECRET` above.
- Restart the API after editing `.env`.

### A4. EAS project (required — push tokens don't work without it)

```
cd apps/client
npx eas login       # free Expo account if you don't have one
npx eas init         # writes extra.eas.projectId into app.json automatically
```
Confirm `apps/client/app.json` now has `extra.eas.projectId` set to a real UUID before continuing.

### A5. First admin account

1. Sign in once through Clerk (dashboard -> Users -> Create, or your own sign-in once it's live) to get a real `user_id` (`user_...`).
2. `psql -h localhost -U karma -d karma_dev`
   ```sql
   INSERT INTO users (clerk_user_id, role, status) VALUES ('user_xxxxxxxxxxxx', 'ADMIN', 'ACTIVE');
   ```

## Part B — start everything

```
# terminal 1 — API + notification worker (same process, see apps/api/src/server.ts)
cd apps/api && pnpm dev

# terminal 2 — admin web
cd apps/admin && pnpm dev

# terminal 3 — client, real device via Expo Go
cd apps/client && npx expo start
```

Check terminal 1 for `Server listening at http://0.0.0.0:4000`, then:
```
curl http://localhost:4000/health/ready
```
Expect `"clerkConfigured":true` now that a real secret key is set. If it still says `false`, the key wasn't saved correctly — check for stray whitespace or the `REPLACE_ME` placeholder still present.

## Part C — the 13-point acceptance test

Each numbered item below matches your acceptance list exactly.

**1. Client app installs and launches.**
Install **Expo Go** (Play Store) on your Android phone. Scan the QR code from terminal 3. Same Wi-Fi network as your laptop — guest/isolated networks will fail silently; use a personal hotspot if needed.
Pass: app opens to the sign-in screen.

**2. Client authentication works as far as the environment allows.**
Admin app -> **Clients -> Invite client** with a real email you control. Complete the Clerk invite flow, then sign in on the phone with that same email using the six-digit email code or Google (if that email is connected to Google). KARMA has no password or SMS sign-in flow.
Pass: phone lands on the Signals tab, not stuck on sign-in.

**3. Push permission is requested and device activation completes.**
On first launch, the OS permission dialog should appear (this is `usePushNotifications()` in `apps/client/src/lib/pushNotifications.ts`).
Pass: dialog appears; tap Allow; after token registration the Signals tab loads. KARMA deliberately keeps protected content closed until this device is registered, because notification permission is required for the one-active-device rule.

**4 & 5. Expo push token is generated and registered with the backend.**
Watch terminal 1's logs for a `POST /client/devices` request succeeding.

**6. Device appears in PostgreSQL.**
```sql
SELECT client_id, expo_push_token, platform, created_at FROM devices WHERE revoked_at IS NULL;
```
Pass: one row, `platform = 'ANDROID'`, a real `ExponentPushToken[...]` value.
If empty: almost always `EXPO_PUBLIC_API_BASE_URL` still pointing at `localhost` — the phone can't resolve that to your laptop.

**7. Active client receives a published test signal.**
Admin -> that client's detail page -> **Extend membership** (+30d, mark payment received) so membership is `ACTIVE` — signals are never delivered without it (recipient snapshot is frozen at publish time, not a UI-only filter).
Admin -> **Signals -> New Signal** -> fill entry/SL/target1 + Angel One exchange/trading symbol -> **Create draft** -> **Publish**.
Pass: push notification appears on the phone within a few seconds.
If not:
```sql
SELECT status, attempts, last_error FROM notification_jobs WHERE signal_id = '<signal-id>';
```
`SENT` with nothing on the phone -> check notification permissions in Android settings. `FAILED`/`DEAD_LETTER` with `last_error` populated -> that error is the real cause (e.g. an invalid/stale token).

**8. Notification payload references the correct signal.**
Code-verified already (`data: { signalId: signal.id, eventType }` in `worker.ts`, matched by the client's tap handler) — confirm visually the notification text names the right instrument.

**9 & 10. Tapping opens the correct signal detail, contents match exactly.**
Tap the notification.
Pass: app opens directly to that signal's detail screen (not the list), and entry/SL/targets match exactly what you entered in step 7.

**11. EXIT NOW reaches the device.**
On that same signal in admin -> **EXIT NOW** -> confirm. This uses a separate BullMQ queue (`notifications-critical`) specifically so it can never queue behind routine updates.
Pass: notification arrives, at least as fast as the original; signal detail shows the red EXIT NOW banner.

**12. Expired/suspended clients do not receive new signals.**
Create a second test client, do **not** extend their membership (stays `EXPIRED` by default). Publish a new signal.
Pass: no notification on that client's device; confirm via:
```sql
SELECT client_id FROM signal_recipients WHERE signal_id = '<new-signal-id>';
```
should list only the active-membership client.
Also test: suspend client A (**Suspend** button) while their membership is active, publish another signal — same expectation, confirmed via the same query.

**13. Multiple clients/devices receive only what they're entitled to.**
Activate the second client's membership too. Publish a signal — both should receive it. Suspend client A again. Publish another — only client B should receive it. This is the same logic already covered by automated tests against live Postgres (`clientIsolation.test.ts`, `authRbac.integration.test.ts`) — this step confirms the real-world wiring (push delivery, phone-side rendering) matches that logic.

## Part E — two-phone one-active-device acceptance test

1. On Phone A, sign in and allow notifications. Confirm it loads the Signals tab.
2. On Phone B, sign in with the same active account and allow notifications. Confirm it loads the Signals tab.
3. On Phone A, pull to refresh or open an existing signal.

Pass: Phone A is returned to sign-in because the API responds with `device_revoked`; Phone B remains active and is the only active `devices` row. This is enforced by the server, not merely hidden in the interface.

4. Sign in a different active client on another phone.

Pass: the different client remains independently active. The restriction is one device **per client**, never one device for the whole platform.

## Part D — what "complete" means here

Do not consider this done based on steps 1-6 alone (app runs, permission granted, token registered) — those only prove client-side plumbing. The test is only meaningful once step 7 through 13 are confirmed with actual notifications landing on the actual phone.
