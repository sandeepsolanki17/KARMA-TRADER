import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMyProfile, useMySignals } from '../../src/lib/queries';
import { GlassPanel, StatusBadge } from '../../src/components/GlassPanel';
import { colors, radius } from '../../src/lib/theme';

export default function SignalsListScreen() {
  const { data: signals, isLoading, refetch, isRefetching } = useMySignals();
  const { data: profile } = useMyProfile();
  const router = useRouter();

  const membershipInactive =
    !profile?.membership || profile.membership.status !== 'ACTIVE' || new Date(profile.membership.expiresAt) < new Date();

  return (
    <View style={styles.container}>
      {membershipInactive && (
        <GlassPanel style={styles.warningBanner}>
          <Text style={styles.warningText}>
            Your membership is inactive. You can still view past signals, but you won't receive new ones until it's
            renewed.
          </Text>
        </GlassPanel>
      )}

      <FlatList
        data={signals}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.info} />}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => router.push(`/signal/${item.id}`)}>
            <GlassPanel style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.instrument}>{item.instrumentDisplayName}</Text>
                <StatusBadge status={item.status} />
              </View>
              <View style={styles.cardRow}>
                <Text style={[styles.side, item.side === 'BUY' ? styles.buy : styles.sell]}>{item.side}</Text>
                <Text style={styles.figure}>Entry {item.tradePlan.entry}</Text>
                <Text style={styles.figure}>SL {item.tradePlan.stopLoss}</Text>
              </View>
            </GlassPanel>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No signals yet. New signals will appear here and push a notification.</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.void },
  list: { padding: 16, gap: 10 },
  warningBanner: { margin: 16, marginBottom: 0, borderColor: 'rgba(245,185,66,0.3)' },
  warningText: { color: colors.amber, fontSize: 13, lineHeight: 18 },
  card: { gap: 8, marginBottom: 0 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  instrument: { color: colors.ink, fontSize: 15, fontWeight: '600' },
  cardRow: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  side: { fontSize: 12, fontWeight: '700', fontFamily: 'monospace' },
  buy: { color: colors.buy },
  sell: { color: colors.sell },
  figure: { color: colors.muted, fontSize: 12, fontFamily: 'monospace' },
  empty: { padding: 40, alignItems: 'center' },
  emptyText: { color: colors.muted, fontSize: 13, textAlign: 'center' },
  cardBorder: { borderRadius: radius.lg },
});
