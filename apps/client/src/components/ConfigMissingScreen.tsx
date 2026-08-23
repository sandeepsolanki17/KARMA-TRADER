import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '../lib/theme';
import { GlassPanel } from './GlassPanel';

export function ConfigMissingScreen() {
  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <GlassPanel style={styles.panel}>
          <Text style={styles.eyebrow}>SETUP REQUIRED</Text>
          <Text style={styles.title}>Clerk isn't configured yet</Text>
          <Text style={styles.body}>
            This app needs a real Clerk publishable key before anyone can sign in. Set
            EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY in apps/client/.env with the "Expo" application's publishable key from
            your Clerk dashboard.
          </Text>
        </GlassPanel>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.void },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  panel: { gap: 8 },
  eyebrow: { color: colors.amber, fontFamily: 'monospace', fontSize: 11, letterSpacing: 1 },
  title: { color: colors.ink, fontSize: 20, fontWeight: '600' },
  body: { color: colors.muted, fontSize: 14, lineHeight: 20 },
});
