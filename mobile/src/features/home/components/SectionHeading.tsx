import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { ArrowLink } from '@/components/ui/Links';
import { Text } from '@/components/ui/Text';
import { colors, eyebrow, inkA, serif } from '@/theme';

/** Numbered editorial heading: hairline, "01 What's on", "See all ⟶". */
export function SectionHeading({ number, title, actionLabel, onAction, style }: { number: string; title: string; actionLabel: string; onAction: () => void; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.row, style]}>
      <View style={styles.title} accessibilityRole="header">
        <Text style={[eyebrow(10, 0.14), styles.num]}>{number}</Text>
        <Text style={[serif(27, 400, 1, -0.014), { color: colors.ink }]}>{title}</Text>
      </View>
      <ArrowLink label={actionLabel} onPress={onAction} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, paddingTop: 14, borderTopWidth: 1, borderTopColor: inkA(0.22) },
  title: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  num: { paddingTop: 3, color: colors.caramelDeep },
});
