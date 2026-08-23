import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { colors } from '../../src/lib/theme';
import { setTokenGetter, setUnauthorizedHandler } from '../../src/lib/api';
import { usePushNotifications } from '../../src/lib/pushNotifications';
import { useMyProfile } from '../../src/lib/queries';
import { clerkConfigured } from '../_layout';
import { ConfigMissingScreen } from '../../src/components/ConfigMissingScreen';

export default function AppLayout() {
  if (!clerkConfigured) return <ConfigMissingScreen />;
  return <AuthedAppLayout />;
}

function AuthedAppLayout() {
  const { isLoaded, isSignedIn, getToken, signOut } = useAuth();

  useEffect(() => {
    setTokenGetter(() => getToken());
    return () => setUnauthorizedHandler(null);
  }, [getToken]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      void signOut();
    });
  }, [signOut]);

  const authenticated = isLoaded && Boolean(isSignedIn);

  // Profile query with auto-retry — handles the case where on-demand
  // provisioning is running on the API side (first request may take a
  // moment while the API fetches the Clerk user and links the invite).
  const profileQuery = useMyProfile(authenticated);

  // Track whether we're in the initial loading phase (first 10s after auth)
  // During this window, we show "Setting up..." instead of error states.
  const [initialLoadWindow, setInitialLoadWindow] = useState(true);
  const authTimestamp = useRef(0);

  useEffect(() => {
    if (authenticated && authTimestamp.current === 0) {
      authTimestamp.current = Date.now();
      // Give the API up to 10 seconds for on-demand provisioning
      const timer = setTimeout(() => setInitialLoadWindow(false), 10_000);
      return () => clearTimeout(timer);
    }
  }, [authenticated]);

  // If the profile query succeeds, immediately end the initial load window
  useEffect(() => {
    if (profileQuery.data) {
      setInitialLoadWindow(false);
    }
  }, [profileQuery.data]);

  const membership = profileQuery.data?.membership ?? null;
  const membershipActive = Boolean(
    membership && membership.status === 'ACTIVE' && new Date(membership.expiresAt).getTime() > Date.now(),
  );

  // Only attempt device activation after we have a confirmed active membership
  const deviceActivation = usePushNotifications(getToken, authenticated && membershipActive);

  // --- Render states (in priority order) ---

  if (!isLoaded) {
    return (
      <View style={styles.centerScreen}>
        <ActivityIndicator color={colors.amber} />
      </View>
    );
  }

  if (!isSignedIn) {
    return <Redirect href="/sign-in" />;
  }

  // Profile loading — during initial window, show a friendlier message
  if (profileQuery.isLoading || (profileQuery.isError && initialLoadWindow)) {
    return (
      <View style={styles.centerScreen}>
        <ActivityIndicator color={colors.amber} size="large" />
        <Text style={styles.activationTitle}>Setting up your KARMA account</Text>
        <Text style={styles.activationBody}>
          {profileQuery.isError
            ? 'Connecting your account — this usually takes a few seconds...'
            : 'Checking your KARMA membership…'}
        </Text>
      </View>
    );
  }

  // Profile error AFTER the initial window has passed
  if (profileQuery.isError || !profileQuery.data) {
    const err = profileQuery.error as any;
    const isNotProvisioned =
      err?.status === 403 ||
      (typeof err?.body === 'object' && err?.body?.error === 'account_not_provisioned');

    return (
      <View style={styles.centerScreen}>
        <Text style={styles.activationTitle}>
          {isNotProvisioned ? 'No invitation found' : 'Account verification failed'}
        </Text>
        <Text style={styles.activationBody}>
          {isNotProvisioned
            ? 'Your email is not linked to any KARMA organization yet. Ask your admin to invite you, then sign in again.'
            : 'KARMA could not verify your client account. Check your connection and try again.'}
        </Text>
        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.activationButton} onPress={() => void profileQuery.refetch()}>
            <Text style={styles.activationButtonText}>Retry</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.activationButtonOutline} onPress={() => void signOut()}>
            <Text style={styles.activationButtonOutlineText}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Membership inactive — authenticated but no paid access
  if (!membershipActive) {
    return (
      <View style={styles.centerScreen}>
        <Text style={styles.activationTitle}>Membership inactive</Text>
        <Text style={styles.activationBody}>
          Your KARMA account is authenticated, but your premium membership is not currently active. Contact your admin to activate or renew access.
        </Text>
        <TouchableOpacity style={styles.activationButton} onPress={() => void signOut()}>
          <Text style={styles.activationButtonText}>Sign out</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Device activation in progress
  if (deviceActivation !== 'ready') {
    const permissionNeeded = deviceActivation === 'permission_required';
    return (
      <View style={styles.centerScreen}>
        {deviceActivation === 'activating' ? <ActivityIndicator color={colors.amber} size="large" /> : null}
        <Text style={styles.activationTitle}>
          {permissionNeeded ? 'Enable notifications' : deviceActivation === 'failed' ? 'Device activation failed' : 'Activating this device'}
        </Text>
        <Text style={styles.activationBody}>
          {permissionNeeded
            ? 'KARMA needs notification permission to activate this device securely and deliver live signal alerts.'
            : deviceActivation === 'failed'
              ? 'KARMA could not activate this phone. Check your connection, sign-in session, and notification access, then restart the app.'
              : 'Securely connecting this phone to your KARMA account.'}
        </Text>
        {permissionNeeded ? (
          <TouchableOpacity style={styles.activationButton} onPress={() => void Linking.openSettings()}>
            <Text style={styles.activationButtonText}>Open settings</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  // --- Fully authenticated, provisioned, membership active, device ready ---
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.void },
        headerTintColor: colors.ink,
        headerShadowVisible: false,
        headerLeft: () => (
          <Text style={{ color: colors.ink, fontSize: 20, fontWeight: '700', letterSpacing: 1, paddingLeft: 16 }}>
            KARMA
          </Text>
        ),
        tabBarStyle: { backgroundColor: colors.void, borderTopColor: colors.hairline },
        tabBarActiveTintColor: colors.amber,
        tabBarInactiveTintColor: colors.muted,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Signals', headerTitle: '' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', headerTitle: '' }} />
      <Tabs.Screen name="signal/[id]" options={{ href: null, title: 'Signal', headerTitle: '' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  centerScreen: { flex: 1, backgroundColor: colors.void, alignItems: 'center', justifyContent: 'center', padding: 28 },
  activationTitle: { color: colors.ink, fontSize: 19, fontWeight: '700', marginTop: 16, marginBottom: 8, textAlign: 'center' },
  activationBody: { color: colors.muted, fontSize: 14, lineHeight: 20, textAlign: 'center', maxWidth: 360 },
  buttonRow: { flexDirection: 'row', gap: 12, marginTop: 22 },
  activationButton: { backgroundColor: colors.amber, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 12, marginTop: 22 },
  activationButtonText: { color: colors.void, fontWeight: '700' },
  activationButtonOutline: { borderColor: colors.hairline, borderWidth: 1, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 12, marginTop: 22 },
  activationButtonOutlineText: { color: colors.muted, fontWeight: '600' },
});
