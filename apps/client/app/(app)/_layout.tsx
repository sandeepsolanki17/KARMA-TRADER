import { useEffect } from 'react';
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
  const profileQuery = useMyProfile(authenticated);
  const membership = profileQuery.data?.membership ?? null;
  const membershipActive = Boolean(
    membership && membership.status === 'ACTIVE' && new Date(membership.expiresAt).getTime() > Date.now(),
  );
  const deviceActivation = usePushNotifications(getToken, authenticated && membershipActive);

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

  if (profileQuery.isLoading) {
    return (
      <View style={styles.centerScreen}>
        <ActivityIndicator color={colors.amber} />
        <Text style={styles.activationBody}>Checking your KARMA membership…</Text>
      </View>
    );
  }

  if (profileQuery.isError || !profileQuery.data) {
    return (
      <View style={styles.centerScreen}>
        <Text style={styles.activationTitle}>Account verification failed</Text>
        <Text style={styles.activationBody}>
          KARMA could not verify your client account. Restart the app and try again, or contact your admin if the problem persists.
        </Text>
      </View>
    );
  }

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

  if (deviceActivation !== 'ready') {
    const permissionNeeded = deviceActivation === 'permission_required';
    return (
      <View style={styles.centerScreen}>
        {deviceActivation === 'activating' ? <ActivityIndicator color={colors.amber} /> : null}
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
  activationButton: { backgroundColor: colors.amber, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 12, marginTop: 22 },
  activationButtonText: { color: colors.void, fontWeight: '700' },
});
