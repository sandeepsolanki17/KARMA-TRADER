import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useQuery } from '@tanstack/react-query';
import { useMyProfile } from '../../src/lib/queries';
import { api } from '../../src/lib/api';
import { GlassPanel, StatusBadge } from '../../src/components/GlassPanel';
import { colors } from '../../src/lib/theme';
import type { Device } from '../../src/types';

export default function ProfileScreen() {
  const { data, isLoading } = useMyProfile();
  const { signOut } = useAuth();
  const { data: devices } = useQuery({
    queryKey: ['my-devices'],
    queryFn: () => api.get<{ devices: Device[] }>('/client/devices').then((r) => r.devices),
  });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <GlassPanel style={styles.card}>
        <Text style={styles.eyebrow}>NAME</Text>
        <Text style={styles.name}>{isLoading ? '—' : data?.client.name}</Text>
      </GlassPanel>

      <GlassPanel style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.eyebrow}>MEMBERSHIP</Text>
          {data?.membership && <StatusBadge status={data.membership.status} />}
        </View>
        <Text style={styles.value}>
          {data?.membership ? `Expires ${new Date(data.membership.expiresAt).toLocaleDateString()}` : '—'}
        </Text>
      </GlassPanel>

      <GlassPanel style={styles.card}>
        <Text style={styles.eyebrow}>PREFERRED BROKER</Text>
        <Text style={styles.value}>{data?.client.preferredBroker ?? '—'}</Text>
      </GlassPanel>

      <GlassPanel style={styles.card}>
        <Text style={styles.eyebrow}>THIS DEVICE</Text>
        <Text style={styles.deviceNote}>
          KARMA allows one active device per account. Signing in on a new phone automatically signs this one out.
        </Text>
        {devices?.map((d) => (
          <View key={d.id} style={styles.deviceRow}>
            <Text style={styles.value}>{d.deviceName ?? d.platform}</Text>
            <Text style={styles.deviceMeta}>registered {new Date(d.createdAt).toLocaleDateString()}</Text>
          </View>
        ))}
      </GlassPanel>

      <TouchableOpacity style={styles.signOutButton} onPress={() => signOut()}>
        <Text style={styles.signOutText}>Sign out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.void },
  content: { padding: 16, gap: 12 },
  card: { gap: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { color: colors.muted, fontSize: 10, fontFamily: 'monospace', letterSpacing: 1 },
  name: { color: colors.ink, fontSize: 18, fontWeight: '600' },
  value: { color: colors.ink, fontSize: 15, fontFamily: 'monospace' },
  deviceNote: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  deviceRow: { marginTop: 8, gap: 2 },
  deviceMeta: { color: colors.muted, fontSize: 11, fontFamily: 'monospace' },
  signOutButton: {
    marginTop: 12,
    borderColor: 'rgba(255,107,91,0.3)',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  signOutText: { color: colors.sell, fontWeight: '600', fontSize: 14 },
});
