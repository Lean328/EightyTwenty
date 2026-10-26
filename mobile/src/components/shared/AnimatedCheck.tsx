import { useEffect } from 'react';
import Animated, { useAnimatedProps, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from '@/theme';

const ACircle = Animated.createAnimatedComponent(Circle);
const APath = Animated.createAnimatedComponent(Path);

/** Ring + tick that draw themselves (`ringDraw .5s`, `checkDraw .35s .38s`). */
export function AnimatedCheck({ size = 76, color = colors.ink }: { size?: number; color?: string }) {
  const ring = useSharedValue(214);
  const tick = useSharedValue(40);
  useEffect(() => {
    ring.value = withTiming(0, { duration: 500 });
    tick.value = withDelay(380, withTiming(0, { duration: 350 }));
  }, [ring, tick]);
  const ringProps = useAnimatedProps(() => ({ strokeDashoffset: ring.value }));
  const tickProps = useAnimatedProps(() => ({ strokeDashoffset: tick.value }));
  return (
    <Svg width={size} height={size} viewBox="0 0 72 72">
      <ACircle cx={36} cy={36} r={34} fill="none" stroke={color} strokeWidth={2} strokeDasharray="214" animatedProps={ringProps} />
      <APath d="M24 37l8 8 16-17" fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="40" animatedProps={tickProps} />
    </Svg>
  );
}
