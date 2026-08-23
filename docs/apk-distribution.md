# Android APK build & distribution

## What this achieves

The target flow is: **Landing page → Download KARMA APK → Install → Email OTP / Google login → membership check → live signals.** No Expo Go, no Node.js, no LAN IP, no `.env` on the end user's phone — those are all *build-time* requirements for you, not runtime requirements for clients.

## One-time setup

```
cd apps/client
npx eas login        # free Expo/EAS account if you don't have one
npx eas init          # links this project, writes extra.eas.projectId to app.json
```

**REQUIRES EAS ACCOUNT** — this is genuinely external; there's no way around creating one.

## Building the distributable APK

```
npx eas build --platform android --profile production-apk
```

This uses the `production-apk` profile in `apps/client/eas.json` (extends `production`, forces `buildType: "apk"` — a plain installable `.apk` rather than Play Store's `.aab` bundle, since this is direct distribution, not Play Store).

**Before running this**, edit `apps/client/eas.json`'s `production.env.EXPO_PUBLIC_API_BASE_URL` to your real, publicly reachable production API domain (not `localhost`, not a LAN IP — this build is what ships to real users' phones on arbitrary networks).

### Signing

EAS manages Android app signing credentials for you automatically on first build (generates and stores a keystore under your EAS account) unless you choose to provide your own. This is standard EAS behavior — **REQUIRES EAS ACCOUNT**, no separate action needed unless you specifically want to supply your own keystore (Play Store publication later would need you to either keep using EAS-managed signing or export the credentials — see EAS's own docs on this if that becomes relevant).

### Output

`eas build` produces a downloadable `.apk` URL when it finishes (several minutes, runs on EAS's build infrastructure — **REQUIRES REAL EAS BUILD, cannot be run in this sandbox**). Download it, host it (see below), and that download link is what the landing page's "Download APK" button points to.

## Where to host the APK file

Anywhere with a stable HTTPS URL — S3/Cloudflare R2/a static file host, or even a GitHub release asset. The landing page (`apps/landing/`) just needs that URL.

## Versioning

`app.json`'s `expo.version` (currently `0.1.0`) is the user-facing version string. Bump it before each new production build; `eas.json` is configured with `"appVersionSource": "local"`, meaning EAS reads the Android `versionCode` from a local file it manages — first build establishes it, subsequent builds increment automatically per EAS's standard behavior.

## iOS

The same Expo/React Native codebase is iOS-compatible (see `apps/client/app.json`'s `ios` block, already configured with a bundle identifier). Building an iOS binary follows the same `eas build --platform ios` path but additionally **REQUIRES AN APPLE DEVELOPER ACCOUNT** ($99/year) for code signing — there is no free equivalent to EAS's automatic Android signing for iOS. App Store submission is a separate, later step (`eas submit`) not required for this launch. Nothing in the codebase needs to change to support iOS; this is purely a distribution-account requirement, not a code gap.

## What's real vs. what needs you

| Step | Status |
|---|---|
| `eas.json` build profiles | Real, present in this repo |
| `app.json` Android/iOS config | Real, present |
| Running `eas build` | **REQUIRES EAS ACCOUNT + REAL BUILD RUN** — cannot be executed from this sandbox |
| Signing | Handled by EAS automatically once you run a real build |
| Hosting the resulting APK | Your choice of static host, not built here |
| iOS distribution | Code-ready; needs an Apple Developer account to actually build/sign |
