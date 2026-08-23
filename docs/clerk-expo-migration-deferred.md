# @clerk/clerk-expo -> @clerk/expo migration — deferred, with reason

Checked 2026-08-20: @clerk/expo's current peerDependencies require
`expo: '>=54 <58'`. This project is pinned to Expo SDK 51 (~51.0.28) —
a deliberate choice made after an earlier real build failure where pnpm
resolved @clerk/clerk-expo's peers (expo-auth-session, expo-crypto) to
versions built for a newer SDK, breaking the production export.

Migrating to @clerk/expo would require bumping the entire Expo SDK
(51 -> 54+), which cascades into React Native version, New Architecture
requirements, and every expo-* package in this app — a major undertaking
with real regression risk, not a drop-in import swap.

Per instruction ("migrate if the current API supports the existing
implementation"): it does not, so this migration is deferred rather than
attempted. @clerk/clerk-expo (current, v2.20.0) remains fully functional
and is what this app uses. Revisit this when the project is ready to plan
a full Expo SDK upgrade as its own tracked piece of work.
