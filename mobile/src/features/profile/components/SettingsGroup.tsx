import { Children, isValidElement, cloneElement, type ReactElement, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { colors, inkA, sans, serif, shadows } from '@/theme';

/** Rounded ivory card with a serif heading — the Profile hub sections. */
export function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  const rows = Children.toArray(children).filter(isValidElement) as ReactElement<SettingsRowProps>[];
  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <Text accessibilityRole="header" style={[serif(19, 400, 1, -0.01), styles.title]}>
          {title}
        </Text>
        {rows.map((row, i) => cloneElement(row, { last: i === rows.length - 1, key: i }))}
      </View>
    </View>
  );
}

interface SettingsRowProps {
  icon: IconName;
  label: string;
  detail?: string;
  onPress: () => void;
  danger?: boolean;
  last?: boolean;
}

export function SettingsRow({ icon, label, detail, onPress, danger, last }: SettingsRowProps) {
  const color = danger ? colors.danger : colors.ink;
  return (
    <Touchable onPress={onPress} accessibilityLabel={detail ? `${label}, ${detail}` : label} style={[styles.row, !last && styles.sep]}>
      <View style={styles.icon}>
        <Icon name={icon} size={20} strokeWidth={1.6} color={danger ? colors.danger : colors.textSecondary} />
      </View>
      <Text style={[sans(14.5, 500, 1.25), styles.label, { color }]}>{label}</Text>
      {detail ? (
        <Text numberOfLines={1} style={[sans(12.5, 400, 1.2), styles.detail]}>
          {detail}
        </Text>
      ) : null}
      {danger ? null : <Icon name="chevronRight" size={16} strokeWidth={1.8} color={colors.textFaint} />}
    </Touchable>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 14, marginHorizontal: 20 },
  card: { borderRadius: 20, backgroundColor: colors.ivory, borderWidth: 1, borderColor: inkA(0.08), overflow: 'hidden', ...shadows.card },
  title: { paddingTop: 16, paddingHorizontal: 16, paddingBottom: 6, color: colors.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 54, paddingHorizontal: 16 },
  sep: { borderBottomWidth: 1, borderBottomColor: inkA(0.07) },
  icon: { width: 22, alignItems: 'center' },
  label: { flex: 1, minWidth: 0 },
  detail: { maxWidth: '42%', color: colors.textMuted },
});
