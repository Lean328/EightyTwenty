import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Keyframe, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { caramelA, colors, easing, inkA, sans } from '@/theme';
import { Stamp, type StampState } from './Stamp';

/** Design canvas from the prototype: 338×352 with a snaking path to the FREE token. */
const W = 338;
const H = 352;
const ROT = [-5, 3, -2, 6, -4, 2, 5, -3, 1];

function stampPress(delay: number) {
  return new Keyframe({
    0: { opacity: 0, transform: [{ scale: 1.6 }, { rotate: '-14deg' }] },
    60: { opacity: 1, transform: [{ scale: 0.92 }, { rotate: '2deg' }], easing: easing.sheet },
    100: { opacity: 1, transform: [{ scale: 1 }, { rotate: '0deg' }], easing: easing.sheet },
  })
    .duration(500)
    .delay(delay);
}

const rewardIn = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 0.8 }, { rotate: '-10deg' }] },
  60: { opacity: 1, transform: [{ scale: 1.05 }, { rotate: '2deg' }], easing: easing.sheet },
  100: { opacity: 1, transform: [{ scale: 1 }, { rotate: '0deg' }], easing: easing.sheet },
})
  .duration(700)
  .delay(200);

interface StampGridProps {
  stamps: number;
  perReward: number;
  /** Stamps added by the last order — they "press" in one by one. */
  newStamps: number;
  rewardSeen: boolean;
  onRewardPress: () => void;
}

/** Nine stamps in a 3×3 snake (row 2 runs right-to-left) leading to the FREE token. */
export function StampGrid({ stamps, perReward, newStamps, rewardSeen, onRewardPress }: StampGridProps) {
  const [width, setWidth] = useState(W);
  const scale = Math.min(1, width / W);
  const from = stamps - newStamps;
  const ready = stamps >= perReward;

  return (
    <View style={[styles.area, { height: H * scale }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View style={[styles.canvas, { transform: [{ scale }], left: (width - W * scale) / 2 }]}>
        <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={StyleSheet.absoluteFill}>
          <Path d="M48 36H290V126H48V216H290Q290 318 169 318" fill="none" stroke={inkA(0.07)} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
        {Array.from({ length: perReward }, (_, i) => {
          const r = Math.floor(i / 3);
          const c = r === 1 ? 2 - (i % 3) : i % 3;
          const state: StampState = i < stamps ? 'filled' : i === stamps ? 'next' : 'empty';
          const fresh = state === 'filled' && i >= from;
          return (
            <Animated.View
              key={`${i}-${fresh ? 'new' : 'old'}`}
              entering={fresh ? stampPress(250 + (i - from) * 180) : undefined}
              style={[styles.stamp, { left: 48 + c * 121 - 31, top: 36 + r * 90 - 31 }]}
              aria-hidden
            >
              <Stamp n={i + 1} state={state} rotate={state === 'filled' ? ROT[i % 9]! : 0} />
            </Animated.View>
          );
        })}
        {ready ? <RewardToken animate={!rewardSeen} onPress={onRewardPress} /> : <PendingToken />}
      </View>
    </View>
  );
}

function RewardToken({ animate, onPress }: { animate: boolean; onPress: () => void }) {
  const glow = useSharedValue(0);
  useEffect(() => {
    if (animate) glow.value = withDelay(900, withRepeat(withTiming(1, { duration: 1400, easing: easing.easeOut3 }), 2, false));
  }, [animate, glow]);
  const ring = useAnimatedStyle(() => ({ opacity: glow.value > 0 && glow.value < 1 ? 0.6 * (1 - glow.value) : 0, transform: [{ scale: 1 + (glow.value * 52) / 68 }] }));
  return (
    <Animated.View entering={animate ? rewardIn : undefined} style={styles.token}>
      <Animated.View pointerEvents="none" style={[styles.glow, ring]} />
      <Touchable onPress={onPress} accessibilityLabel="Free coffee ready" style={styles.tokenBtn}>
        <Icon name="cup" size={20} strokeWidth={1.8} />
        <Text style={[sans(11, 700, undefined, 0.1), { color: colors.ink }]}>FREE</Text>
      </Touchable>
    </Animated.View>
  );
}

function PendingToken() {
  return (
    <View style={[styles.token, styles.pending]} aria-hidden>
      <Icon name="cup" size={20} strokeWidth={1.6} color={caramelA(0.8)} />
      <Text style={[sans(10, 700, undefined, 0.1), { color: caramelA(0.8) }]}>FREE</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  area: { marginTop: 10 },
  canvas: { position: 'absolute', top: 0, width: W, height: H, transformOrigin: 'top left' },
  stamp: { position: 'absolute', width: 62, height: 62 },
  token: { position: 'absolute', left: 169 - 34, top: 318 - 34, width: 68, height: 68, alignItems: 'center', justifyContent: 'center' },
  tokenBtn: { width: 68, height: 68, borderRadius: 34, backgroundColor: colors.caramel, alignItems: 'center', justifyContent: 'center', gap: 3 },
  glow: { position: 'absolute', width: 68, height: 68, borderRadius: 34, backgroundColor: 'rgba(233,200,158,1)' },
  pending: { borderRadius: 34, borderWidth: 1.5, borderStyle: 'dashed', borderColor: caramelA(0.65), gap: 3 },
});
