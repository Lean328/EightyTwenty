import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Switch } from '@/components/ui/Switch';
import { Text } from '@/components/ui/Text';
import { colors, inkA, sans } from '@/theme';

/** Ivory card holding switch rows (notification and privacy settings). */
export function ToggleGroup({ children }: { children: ReactNode }) {
  return <View style={styles.group}>{children}</View>;
}

export function ToggleRow({ title, description, value, onChange, first }: { title: string; description: string; value: boolean; onChange: (v: boolean) => void; first?: boolean }) {
  return (
    <View style={[styles.row, !first && styles.sep]}>
      <View style={styles.text}>
        <Text style={[sans(14.5, 600, 1.25), { color: colors.ink }]}>{title}</Text>
        <Text style={[sans(12.5, 400, 1.3), styles.sub]}>{description}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={title} />
    </View>
  );
}

const styles = StyleSheet.create({
  group: { paddingHorizontal: 16, borderRadius: 14, backgroundColor: colors.ivory, borderWidth: 1, borderColor: inkA(0.08) },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 66, paddingVertical: 10 },
  sep: { borderTopWidth: 1, borderTopColor: inkA(0.07) },
  text: { flex: 1, minWidth: 0 },
  sub: { marginTop: 2, color: colors.textSecondary },
});
