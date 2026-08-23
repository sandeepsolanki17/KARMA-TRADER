import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSignalDetail } from '../../../src/lib/queries';
import { GlassPanel, StatusBadge } from '../../../src/components/GlassPanel';
import { colors, radius } from '../../../src/lib/theme';
import { openAngelOneStore, toAngelOneOrderParams } from '../../../src/lib/angelOne';

export default function SignalDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading } = useSignalDetail(id);
  const [openingBroker, setOpeningBroker] = useState(false);

  if (isLoading || !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.info} />
      </View>
    );
  }

  const { signal, events } = data;
  const isExit = signal.status === 'EXITED';
  const orderParams = toAngelOneOrderParams(signal.brokerOrderHint, signal.tradePlan.entry);

  const handleAngelOneStore = async () => {
    setOpeningBroker(true);
    try {
      Alert.alert(
        'Enter order manually',
        `KARMA does not place or pre-fill orders. Review these details in Angel One:\n\n${orderParams.transactiontype} ${orderParams.tradingsymbol}\nExchange: ${orderParams.exchange}\nQty: ${orderParams.quantity ?? '—'}\nPrice: ${orderParams.price}`,
      );
      await openAngelOneStore();
    } finally {
      setOpeningBroker(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {isExit && (
        <GlassPanel style={styles.exitBanner}>
          <Text style={styles.exitTitle}>⚠ EXIT NOW</Text>
          <Text style={styles.exitBody}>An emergency exit was issued for this signal. Close your position immediately.</Text>
        </GlassPanel>
      )}

      <GlassPanel>
        <View style={styles.headerRow}>
          <Text style={styles.title}>{signal.instrumentDisplayName}</Text>
          <StatusBadge status={signal.status} />
        </View>

        <View style={styles.grid}>
          <Metric label="Side" value={signal.side} color={signal.side === 'BUY' ? colors.buy : colors.sell} />
          <Metric label="Entry" value={String(signal.tradePlan.entry)} />
          <Metric label="Stop Loss" value={String(signal.tradePlan.stopLoss)} color={colors.sell} />
          <Metric label="Target 1" value={String(signal.tradePlan.target1)} color={colors.buy} />
          {signal.tradePlan.target2 !== null && <Metric label="Target 2" value={String(signal.tradePlan.target2)} color={colors.buy} />}
          {signal.tradePlan.target3 !== null && <Metric label="Target 3" value={String(signal.tradePlan.target3)} color={colors.buy} />}
        </View>

        {signal.notes && <Text style={styles.notes}>{signal.notes}</Text>}
      </GlassPanel>

      <TouchableOpacity style={styles.brokerButton} onPress={handleAngelOneStore} disabled={openingBroker}>
        {openingBroker ? (
          <ActivityIndicator color={colors.void} />
        ) : (
          <Text style={styles.brokerButtonText}>Get Angel One</Text>
        )}
      </TouchableOpacity>
      <Text style={styles.brokerHint}>
        KARMA never opens or pre-fills orders. Use the displayed trade plan to review and place any order yourself.
      </Text>

      <GlassPanel style={{ marginTop: 8 }}>
        <Text style={styles.sectionTitle}>History</Text>
        {events.map((e) => (
          <View key={e.id} style={styles.eventRow}>
            <Text style={styles.eventType}>{e.eventType.replace(/_/g, ' ').toLowerCase()}</Text>
            <Text style={styles.eventTime}>{new Date(e.createdAt).toLocaleString()}</Text>
          </View>
        ))}
      </GlassPanel>
    </ScrollView>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.void },
  content: { padding: 16, gap: 14 },
  center: { flex: 1, backgroundColor: colors.void, alignItems: 'center', justifyContent: 'center' },
  exitBanner: { borderColor: 'rgba(255,107,91,0.4)', backgroundColor: 'rgba(255,107,91,0.08)' },
  exitTitle: { color: colors.sell, fontWeight: '700', fontSize: 15, marginBottom: 4 },
  exitBody: { color: colors.ink, fontSize: 13, lineHeight: 18 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  title: { color: colors.ink, fontSize: 18, fontWeight: '600', flex: 1, marginRight: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metric: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderColor: colors.hairline,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: '30%',
  },
  metricLabel: { color: colors.muted, fontSize: 10, fontFamily: 'monospace', textTransform: 'uppercase', marginBottom: 2 },
  metricValue: { color: colors.ink, fontSize: 15, fontFamily: 'monospace', fontWeight: '600' },
  notes: { color: colors.muted, fontSize: 13, marginTop: 12, lineHeight: 18 },
  brokerButton: { backgroundColor: colors.buy, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center' },
  brokerButtonText: { color: colors.void, fontWeight: '700', fontSize: 15 },
  brokerHint: { color: colors.muted, fontSize: 11, textAlign: 'center', paddingHorizontal: 20 },
  sectionTitle: { color: colors.ink, fontSize: 13, fontWeight: '600', marginBottom: 10 },
  eventRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  eventType: { color: colors.ink, fontSize: 13 },
  eventTime: { color: colors.muted, fontSize: 11, fontFamily: 'monospace' },
});
