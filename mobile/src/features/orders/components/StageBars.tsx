import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { Text } from '@/components/ui/Text';
import { ORDER_STAGES } from '@/domain/orders';
import { colors, easing, inkA, ivoryA, sans } from '@/theme';

/** Received · Confirmed · Preparing · Ready — filled, current (55% + shimmer) or upcoming. */
export function StageBars({ stage }: { stage: number }) {
  return (
    <View style={styles.row} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 4, now: stage, text: ORDER_STAGES[Math.min(stage, 3)] }}>
      {ORDER_STAGES.map((name, i) => {
        const done = i < stage || stage === 4;
        const now = i === stage && stage < 4;
        return <Bar key={name} name={name} done={done} now={now} />;
      })}
    </View>
  );
}

function Bar({ name, done, now }: { name: string; done: boolean; now: boolean }) {
  const scale = useSharedValue(done ? 1 : now ? 0.55 : 0);
  const sweep = useSharedValue(0);
  useEffect(() => {
    scale.value = withTiming(done ? 1 : now ? 0.55 : 0, { duration: 600, easing: easing.standard });
  }, [done, now, scale]);
  useEffect(() => {
    sweep.value = 0;
    if (now) sweep.value = withRepeat(withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }), -1);
  }, [now, sweep]);
  const fill = useAnimatedStyle(() => ({ transform: [{ scaleX: scale.value }] }));
  const shimmer = useAnimatedStyle(() => ({ left: `${-120 * 0.4 + sweep.value * (260 + 120) * 0.4}%` as `${number}%` }));
  return (
    <View style={styles.col}>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, { backgroundColor: done ? colors.ink : colors.caramel, transformOrigin: 'left center' }, fill]} />
        {now ? <Animated.View style={[styles.sweep, shimmer]} /> : null}
      </View>
      <Text style={[sans(11, 600), { color: done || now ? colors.ink : colors.textMuted }]}>{name}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6, marginTop: 22 },
  col: { flex: 1, gap: 8 },
  track: { height: 5, borderRadius: 3, backgroundColor: inkA(0.1), overflow: 'hidden' },
  fill: { ...StyleSheet.absoluteFill, borderRadius: 3 },
  sweep: { position: 'absolute', top: 0, bottom: 0, width: '40%', backgroundColor: ivoryA(0.7) },
});
