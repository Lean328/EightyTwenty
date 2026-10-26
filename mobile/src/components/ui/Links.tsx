import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { colors, sans, shadows } from '@/theme';
import { ArrowLong, Icon, type IconName } from './Icon';
import { Text } from './Text';
import { Touchable } from './Touchable';

/** Editorial "See all ⟶" link. */
export function ArrowLink({ label, onPress, color = colors.caramelDeep, style }: { label: string; onPress: () => void; color?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <Touchable onPress={onPress} style={[styles.arrow, style]} hitSlop={6}>
      <Text style={[sans(13, 600), { color }]}>{label}</Text>
      <ArrowLong color={color} />
    </Touchable>
  );
}

/** Small text action ("Change", "Edit", "Remove"). */
export function TextAction({ label, onPress, color = colors.caramelDeep, weight = 600, style, underline }: { label: string; onPress: () => void; color?: string; weight?: 500 | 600; style?: StyleProp<ViewStyle>; underline?: boolean }) {
  return (
    <Touchable onPress={onPress} style={[styles.text, style]} hitSlop={8}>
      <Text style={[sans(13, weight), { color }, underline && styles.underline]}>{label}</Text>
    </Touchable>
  );
}

/** 40×40 ivory circle (item sheet close / favourite). */
export function RoundIconButton({ icon, onPress, accessibilityLabel, size = 40, iconSize = 18, color = colors.ink, fill, style }: { icon: IconName; onPress: () => void; accessibilityLabel: string; size?: number; iconSize?: number; color?: string; fill?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <Touchable onPress={onPress} accessibilityLabel={accessibilityLabel} style={[styles.round, { width: size, height: size, borderRadius: size / 2 }, style]}>
      <Icon name={icon} size={iconSize} strokeWidth={1.9} color={color} fill={fill} />
    </Touchable>
  );
}

const styles = StyleSheet.create({
  arrow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  text: { paddingVertical: 6 },
  underline: { textDecorationLine: 'underline' },
  round: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ivory, ...shadows.roundButton },
});
