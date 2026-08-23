import { StyleSheet, Text, View, type ViewProps } from 'react-native';
import { colors, radius } from '../lib/theme';
import type { AccountStatus, MembershipStatus, SignalStatus } from '@karma/types';

export function GlassPanel({ style, children, ...rest }: ViewProps) {
  return (
    <View style={[styles.panel, style]} {...rest}>
      {children}
    </View>
  );
}

const STATUS_COLOR: Record<string, string> = {
  DRAFT: colors.muted,
  PUBLISHED: colors.info,
  ENTRY_HIT: colors.info,
  T1_HIT: colors.buy,
  T2_HIT: colors.buy,
  T3_HIT: colors.buy,
  CLOSED: colors.muted,
  CANCELLED: colors.muted,
  EXPIRED: colors.amber,
  EXITED: colors.sell,
  ACTIVE: colors.buy,
  SUSPENDED: colors.amber,
  DEACTIVATED: colors.sell,
};

export function StatusBadge({ status }: { status: SignalStatus | AccountStatus | MembershipStatus }) {
  const color = STATUS_COLOR[status] ?? colors.muted;
  return (
    <View style={styles.badgeRow}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.badgeText, { color }]}>{status.replace(/_/g, ' ')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.panel,
    borderColor: colors.hairline,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 16,
  },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 11, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: 0.5 },
});
