# Firebase Setup

KARMA includes the Firebase client configuration for both supported mobile platforms:

- Android: `apps/client/google-services.json`
- iOS: `apps/client/GoogleService-Info.plist`

The Android Firebase app is registered for `com.karma.tradingsignals`. The iOS Firebase app is registered for bundle identifier `com.karma.tradingsignals`.

## Build requirements

These files are native build inputs. After adding or changing them, create a new EAS development/production build; Metro hot reload cannot add native Firebase configuration to an already-installed binary.

Android remote push also requires valid Firebase Cloud Messaging credentials/configuration in the EAS/Expo project. iOS push requires valid Apple/APNs credentials in EAS in addition to the Firebase client plist.

## Security

These client configuration files do not replace server secrets. Never place Firebase Admin service-account private keys, Clerk secret keys, EAS access tokens, or other private credentials in the repository.
