import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon } from '@/components/ui/Icon';
import { TextAction } from '@/components/ui/Links';
import { Switch } from '@/components/ui/Switch';
import { Text } from '@/components/ui/Text';
import { colors, creamA, eyebrow, fontFamilies, inkA, sans } from '@/theme';

/** Ivory checkout card. */
export function Section({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.section, style]}>{children}</View>;
}

/** "PICKUP ……… Change" card header. */
export function SectionHeader({ label, action, onAction }: { label: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.header}>
      <Text style={[eyebrow(10, 0.12), { color: colors.textMuted }]}>{label}</Text>
      {action && onAction ? <TextAction label={action} onPress={onAction} /> : null}
    </View>
  );
}

/** Apple Pay mark (black chip) or a card icon tile. */
export function PaymentMark({ kind }: { kind: 'apple' | 'card' }) {
  if (kind === 'apple')
    return (
      <View style={[styles.mark, { backgroundColor: colors.black }]}>
        <Text style={[{ fontFamily: fontFamilies.system, fontSize: 11, fontWeight: '600' }, { color: colors.white }]}>Pay</Text>
      </View>
    );
  return (
    <View style={[styles.mark, { backgroundColor: colors.linen }]}>
      <Icon name="card" size={18} strokeWidth={1.7} />
    </View>
  );
}

/** Gift card / free coffee toggle rows. */
export function ToggleCard({ tone, icon, title, sub, value, onChange }: { tone: 'light' | 'dark'; icon: 'gift' | 'cupPlain'; title: string; sub: string; value: boolean; onChange: (v: boolean) => void }) {
  const dark = tone === 'dark';
  return (
    <View style={[styles.toggle, dark ? styles.toggleDark : styles.toggleLight]}>
      <View style={[styles.toggleIcon, dark ? { backgroundColor: colors.sand, borderRadius: 19 } : { backgroundColor: colors.linen, borderRadius: 11 }]}>
        <Icon name={icon} size={19} strokeWidth={1.7} color={dark ? colors.espresso : colors.ink} />
      </View>
      <View style={styles.flex}>
        <Text style={[sans(14, 600, 1.3), { color: dark ? colors.creamText : colors.ink }]}>{title}</Text>
        <Text style={[sans(12, 400, 1.3), { marginTop: 2, color: dark ? creamA(0.75) : colors.textSecondary }]}>{sub}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={title} tone={tone} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  section: { paddingVertical: 14, paddingHorizontal: 16, borderRadius: 14, backgroundColor: colors.ivory, borderWidth: 1, borderColor: inkA(0.08) },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  mark: { width: 44, height: 30, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 14 },
  toggleLight: { backgroundColor: colors.ivory, borderWidth: 1, borderColor: inkA(0.08) },
  toggleDark: { backgroundColor: colors.espresso },
  toggleIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
});
