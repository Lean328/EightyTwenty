import { useEffect, type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { Keyframe, useAnimatedStyle, useSharedValue, withDelay, withTiming, type WithTimingConfig } from 'react-native-reanimated';
import { duration as durations, easing } from '@/theme';

/**
 * Mount animations for content in normal layout flow.
 *
 * These drive opacity/transform with shared values rather than Reanimated `entering`
 * layout animations: on web, `entering` positions the element absolutely while it runs,
 * which collapses surrounding layout. Use `entering` keyframes only on elements that are
 * already absolutely positioned (toasts, overlays, stamps).
 * All timings respect the OS "Reduce Motion" setting.
 */
function useMountProgress(delay: number, duration: number, curve: WithTimingConfig['easing']) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.set(withDelay(delay, withTiming(1, { duration, easing: curve })));
  }, [p, delay, duration, curve]);
  return p;
}

/** `@keyframes rise`: fade in while lifting `distance` pt (default 10pt, .36s standard curve). */
export function Rise({ children, delay = 0, distance = 10, duration = durations.rise, style }: { children: ReactNode; delay?: number; distance?: number; duration?: number; style?: StyleProp<ViewStyle> }) {
  const p = useMountProgress(delay, duration, easing.standard);
  const anim = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ translateY: (1 - p.value) * distance }] }));
  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}

/** Accordion reveal (`@keyframes accIn`: 4pt drop, .2s). */
export function Reveal({ children, duration = 200, style }: { children: ReactNode; duration?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <Rise distance={-4} duration={duration} style={style}>
      {children}
    </Rise>
  );
}

/** `@keyframes fadeIn`. */
export function FadeIn({ children, delay = 0, duration = 250, style }: { children: ReactNode; delay?: number; duration?: number; style?: StyleProp<ViewStyle> }) {
  const p = useMountProgress(delay, duration, easing.ease);
  const anim = useAnimatedStyle(() => ({ opacity: p.value }));
  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}

/** Keyframe version — only for absolutely positioned elements (see note above). */
export const fadeKeyframe = (duration = 250, delay = 0) => new Keyframe({ 0: { opacity: 0 }, 100: { opacity: 1 } }).duration(duration).delay(delay);

/** `@keyframes stepIn`: grows from 55% width (set `transformOrigin` in `style`), .2s. */
export function ScaleIn({ children, duration = 200, style }: { children: ReactNode; duration?: number; style?: StyleProp<ViewStyle> }) {
  const p = useMountProgress(0, duration, easing.standard);
  const anim = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ scaleX: 0.55 + p.value * 0.45 }] }));
  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}

/** `@keyframes toastIn`: drops 8pt and settles from 98% scale, .26s. */
export function DropIn({ children, duration = 260, style }: { children: ReactNode; duration?: number; style?: StyleProp<ViewStyle> }) {
  const p = useMountProgress(0, duration, easing.standard);
  const anim = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ translateY: (1 - p.value) * -8 }, { scale: 0.98 + p.value * 0.02 }] }));
  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}
