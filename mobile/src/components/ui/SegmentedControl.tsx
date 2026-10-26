import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, inkA, sans, shadows } from '@/theme';
import { Text } from './Text';
import { Touchable } from './Touchable';

interface Segment<T extends string> {
  value: T;
  label: string;
  /** Greyed (e.g. a fulfilment method the café doesn't offer) but still pressable. */
  dimmed?: boolean;
}

interface SegmentedControlProps<T extends string> {
  segments: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  height?: number;
  /** `ivory` = active segment lifts on linen (activity, order sheet); `ink` = auth sheet tabs. */
  tone?: 'ivory' | 'ink';
  style?: StyleProp<ViewStyle>;
}

export function SegmentedControl<T extends string>({ segments, value, onChange, height = 38, tone = 'ivory', style }: SegmentedControlProps<T>) {
  const ink = tone === 'ink';
  return (
    <View style={[styles.track, ink ? styles.trackInk : styles.trackIvory, style]} accessibilityRole="tablist">
      {segments.map((s) => {
        const on = s.value === value;
        return (
          <Touchable
            key={s.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(s.value)}
            pressedScale={ink ? 1 : 0.97}
            style={[
              styles.segment,
              { height, borderRadius: ink ? 8 : 9 },
              on && (ink ? { backgroundColor: colors.ink } : { backgroundColor: colors.ivory, ...shadows.segment }),
            ]}
          >
            <Text style={[sans(13, ink ? 500 : 600), { color: on && ink ? colors.creamWarm : s.dimmed ? inkA(0.35) : colors.ink }]}>{s.label}</Text>
          </Touchable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', gap: 2, padding: 3 },
  trackIvory: { borderRadius: 12, backgroundColor: colors.linen },
  trackInk: { borderRadius: 10, backgroundColor: inkA(0.07) },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
