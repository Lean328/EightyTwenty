import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { colors, eyebrow, espressoA, sans, serif } from '@/theme';

/** Shared pieces of the website-derived Reserve and Catering forms. */

/** "1 · LOCATION" step label. */
export function StepLabel({ children, optional }: { children: string; optional?: boolean }) {
  return (
    <Text style={[eyebrow(11, 0.14, 500), styles.step]}>
      {children}
      {optional ? <Text style={[sans(11, 500), styles.optional]}> (optional)</Text> : null}
    </Text>
  );
}

/** Date field that opens the calendar sheet (with the small calendar glyph). */
export function DateButton({ label, hasValue, error, onPress, accessibilityLabel }: { label: string; hasValue: boolean; error?: boolean; onPress: () => void; accessibilityLabel: string }) {
  return (
    <Touchable onPress={onPress} pressedScale={1} accessibilityLabel={`${accessibilityLabel}, ${label}`} accessibilityHint="Opens a calendar" style={[styles.date, { borderColor: error ? colors.dangerBright : espressoA(0.2) }]}>
      <Text numberOfLines={1} style={[sans(15), { flexShrink: 1, color: hasValue ? colors.espressoText : colors.textWarmMuted }]}>
        {label}
      </Text>
      <View style={styles.glyph}>
        <View style={styles.glyphTop} />
      </View>
    </Touchable>
  );
}

/** Success card ("Your booking email is ready.") with the green tick. */
export function SuccessCard({ title, children, style }: { title: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.success, style]}>
      <View style={styles.tick}>
        <Text style={{ fontSize: 24, color: colors.successText }}>✓</Text>
      </View>
      <Text accessibilityRole="header" style={[serif(32, 400, 1.05), { color: colors.espressoText }]}>
        {title}
      </Text>
      {children}
    </View>
  );
}

/** Definition list rows inside the success card. */
export function Summary({ rows }: { rows: [string, string][] }) {
  return (
    <View style={styles.summary}>
      {rows.map(([k, v]) => (
        <View key={k} style={styles.summaryRow}>
          <Text style={[sans(14, 400, 1.4), styles.summaryKey]}>{k}</Text>
          <Text style={[sans(14, 500, 1.4), styles.summaryVal]}>{v}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  step: { marginBottom: 10, color: colors.caramelDeep },
  optional: { letterSpacing: 0, textTransform: 'none', color: colors.textWarmMuted },
  date: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, height: 46, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, backgroundColor: colors.sandstoneCard, minWidth: 0 },
  glyph: { width: 14, height: 14, borderWidth: 1.5, borderColor: colors.textWarmMuted, borderRadius: 3, overflow: 'hidden' },
  glyphTop: { height: 4, backgroundColor: colors.textWarmMuted },
  success: { gap: 16, marginTop: 14, marginHorizontal: 16, paddingTop: 24, paddingHorizontal: 20, paddingBottom: 26, borderWidth: 1, borderColor: espressoA(0.14), borderRadius: 10, backgroundColor: colors.sandstoneCard },
  tick: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.successBg, alignItems: 'center', justifyContent: 'center' },
  summary: { gap: 10, paddingVertical: 16, borderTopWidth: 1, borderBottomWidth: 1, borderColor: espressoA(0.12) },
  summaryRow: { flexDirection: 'row', gap: 18 },
  summaryKey: { width: 64, color: colors.textWarmMuted },
  summaryVal: { flex: 1, color: colors.espressoText },
});
