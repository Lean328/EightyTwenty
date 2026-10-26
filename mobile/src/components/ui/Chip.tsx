import type { ReactNode } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { colors, espressoA, inkA, sans } from '@/theme';
import { Text } from './Text';
import { Touchable } from './Touchable';

interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** `ink` = account screens (prefs, gift amounts); `espresso` = reserve & catering. */
  tone?: 'ink' | 'espresso';
  height?: number;
  radius?: number;
  fontSize?: number;
  weight?: 500 | 600;
  trailing?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Toggle chip (`chip()` in the prototype). */
export function Chip({ label, selected, onPress, tone = 'ink', height = 34, radius = 999, fontSize = 12, weight = 500, trailing, style }: ChipProps) {
  const ink = tone === 'ink';
  const on = ink ? colors.ink : colors.espresso;
  const fgOn = ink ? colors.ivory : colors.sandstone;
  const fgOff = ink ? colors.ink : colors.espresso;
  const borderOff = ink ? inkA(0.16) : espressoA(0.18);
  return (
    <Touchable
      onPress={onPress}
      pressedScale={ink ? 0.97 : 1}
      accessibilityState={{ selected }}
      style={[
        styles.chip,
        { height, borderRadius: radius, backgroundColor: selected ? on : ink ? colors.ivory : 'transparent', borderColor: selected ? on : borderOff },
        style,
      ]}
    >
      <Text style={[sans(fontSize, weight), { color: selected ? fgOn : fgOff }]}>{label}</Text>
      {trailing}
    </Touchable>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12, borderWidth: 1 },
});
