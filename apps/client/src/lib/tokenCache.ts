import * as SecureStore from 'expo-secure-store';

/**
 * Clerk Expo requires a tokenCache implementation to persist the session
 * across app restarts. expo-secure-store is the standard, OS-backed choice
 * (Keychain on iOS, Keystore-backed EncryptedSharedPreferences on Android).
 */
export const tokenCache = {
  async getToken(key: string) {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  async saveToken(key: string, value: string) {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      // best-effort — a failed cache write just means a re-login next launch
    }
  },
};
