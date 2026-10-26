import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { colors, easing, inkA, shadows } from '@/theme';
import { Touchable } from './Touchable';

interface SwitchProps {
  value: boolean;
  onValueChange: (next: boolean) => void;
  accessibilityLabel: string;
  /** Colours for the dark (espresso) reward row. */
  tone?: 'light' | 'dark';
}

/** The prototype's 48×28 toggle: ink when on, knob slides 2 → 22px. */
export function Switch({ value, onValueChange, accessibilityLabel, tone = 'light' }: SwitchProps) {
  const progress = useSharedValue(value ? 1 : 0);
  useEffect(() => {
    progress.value = withTiming(value ? 1 : 0, { duration: 200, easing: easing.standard });
  }, [value, progress]);

  const offBg = tone === 'dark' ? inkA(0.2) : inkA(0.2);
  const track = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(progress.value, [0, 1], [offBg, colors.ink]) }));
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: progress.value * 20 }] }));

  return (
    <Touchable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={accessibilityLabel}
      onPress={() => onValueChange(!value)}
      hitSlop={8}
      style={styles.hit}
    >
      <Animated.View style={[styles.track, tone === 'dark' && styles.trackDark, track]}>
        <Animated.View style={[styles.knob, tone === 'dark' && { backgroundColor: colors.creamText }, knob]} />
      </Animated.View>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  hit: { flexShrink: 0 },
  track: { width: 48, height: 28, borderRadius: 14 },
  trackDark: { boxShadow: 'inset 0 0 0 1px rgba(245,237,226,0.25)' },
  knob: { position: 'absolute', top: 2, left: 2, width: 24, height: 24, borderRadius: 12, backgroundColor: colors.ivory, ...shadows.switchKnob },
});
