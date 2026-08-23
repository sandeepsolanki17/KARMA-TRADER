# KARMA Trading Platform — Current Release Status

This archive is a corrected source release built from the KARMA handoff project and the supplied Firebase Android/iOS configuration files.

## Completed in this revision

- Added `apps/client/google-services.json` for Android Firebase/FCM.
- Added `apps/client/GoogleService-Info.plist` for iOS Firebase configuration.
- Added Expo/EAS `googleServicesFile` references for Android and iOS.
- Fixed Clerk pending-session navigation handling through the Expo Router `navigate` bridge.
- Restored awaited Clerk session activation after Email OTP verification.
- Prevented API 401 handling from forcing sign-out when no bearer token was available.
- Added explicit authenticated-token waiting for device activation.
- Device activation now sends the exact Clerk token used during activation instead of depending on a global timing race.
- Removed the fake `FIREBASE_NOT_CONFIGURED_DEV_TOKEN` fallback.
- Push-token acquisition now fails closed until a real Expo push token is obtained.
- Device activation and push-token acquisition remain separately error-handled.
- Hardened one-device-per-client enforcement by rejecting previously revoked Clerk sessions from reclaiming the account.
- Device re-registration is now keyed to the authenticated Clerk session, so push-token rotation does not incorrectly become a second device.
- Added an indexed `clerk_session_id` lookup migration (`0003_device_session_lookup.sql`).
- Added a regression test for a revoked session attempting to reactivate its old device.

## Validation performed in this environment

- 77 TypeScript/TSX source files parsed successfully with the installed TypeScript transpiler (excluding declaration-only `.d.ts` files).
- JSON and plist configuration parsed successfully.
- Android package and iOS bundle identifiers match `com.karma.tradingsignals`.
- Firebase files are present at the configured paths.
- No fake push-token fallback remains in client source.
- Real `.env` files are absent from the release archive.

## Not honestly claimable here

A full `pnpm install`, typecheck, test suite, Expo export, EAS build, real Clerk session, Firebase/FCM delivery, Android push delivery, iOS push delivery, Angel One device flow, and physical-device validation were not executed in this environment because the handoff archive intentionally excludes installed dependencies and package downloads are unavailable here.

The project should be rerun locally with the existing lockfile, all three Firebase/Clerk environments configured, migrations 0001–0003 applied, and a fresh EAS development build created after the native Firebase files were added.
