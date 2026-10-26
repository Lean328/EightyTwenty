import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { colors, easing, sans } from '@/theme';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

/** Pulsing placeholder block (`@keyframes skel`, 1.2s). */
export function Skeleton({ style, delay = 0 }: { style?: StyleProp<ViewStyle>; delay?: number }) {
  const o = useSharedValue(0.5);
  useEffect(() => {
    o.value = withDelay(delay, withRepeat(withSequence(withTiming(1, { duration: 600 }), withTiming(0.5, { duration: 600 })), -1));
  }, [delay, o]);
  const anim = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ backgroundColor: colors.skeleton }, style, anim]} />;
}

/** Centered empty state: icon disc, title, body, optional action. */
export function EmptyState({
  icon,
  title,
  body,
  actionLabel,
  onAction,
  actionVariant = 'outline',
  style,
}: {
  icon: IconName;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionVariant?: 'outline' | 'primary';
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.empty, style]}>
      <View style={styles.disc}>
        <Icon name={icon} size={24} strokeWidth={1.6} />
      </View>
      <Text style={[sans(16, 600, 1.3), styles.emptyTitle]}>{title}</Text>
      {body ? <Text style={[sans(14, 400, 1.45), styles.emptyBody]}>{body}</Text> : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} variant={actionVariant} height={actionVariant === 'primary' ? 48 : 46} style={styles.emptyAction} />
      ) : null}
    </View>
  );
}

/** Error state with retry for failed queries. */
export function ErrorState({ message, onRetry, style }: { message: string; onRetry?: () => void; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.empty, style]} accessibilityRole="alert">
      <Text style={[sans(16, 600, 1.3), styles.emptyTitle]}>Couldn’t load this</Text>
      <Text style={[sans(14, 400, 1.45), styles.emptyBody]}>{message}</Text>
      {onRetry ? <Button label="Try again" onPress={onRetry} variant="outline" height={46} style={styles.emptyAction} /> : null}
    </View>
  );
}

/** Inline alert box (validation summary in forms). */
export function AlertBox({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View accessibilityRole="alert" style={[styles.alert, style]}>
      <Text style={[sans(13, 500, 1.4), { color: colors.alertText }]}>{children}</Text>
    </View>
  );
}

/** Animates a value change like the prototype's numA/numB keyframes (fade up 6px, .22s). */
export function PopText({ value, style, duration = 220 }: { value: string; style?: StyleProp<TextStyle>; duration?: number }) {
  const p = useSharedValue(1);
  useEffect(() => {
    p.value = 0;
    p.value = withTiming(1, { duration, easing: easing.ease });
  }, [value, p, duration]);
  const anim = useAnimatedStyle(() => ({ opacity: 0.25 + p.value * 0.75, transform: [{ translateY: (1 - p.value) * 6 }] }));
  return (
    <Animated.View style={anim}>
      <Text style={style}>{value}</Text>
    </Animated.View>
  );
}

/** Count badge that pops (scale 1 → 1.3 → 1, .34s) whenever the count changes. */
export function CountBadge({ count, background = colors.caramel, borderColor = colors.cream, color = colors.ink, style }: { count: number; background?: string; borderColor?: string; color?: string; style?: StyleProp<ViewStyle> }) {
  const s = useSharedValue(1);
  useEffect(() => {
    s.value = withSequence(withTiming(1.3, { duration: 136, easing: easing.pop }), withTiming(1, { duration: 204, easing: easing.pop }));
  }, [count, s]);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Animated.View style={[styles.badge, { backgroundColor: background, borderColor }, style, anim]}>
      <Text style={[sans(10, 700), { color }]}>{count}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', gap: 10, paddingHorizontal: 32, paddingVertical: 64 },
  disc: { width: 58, height: 58, borderRadius: 29, backgroundColor: colors.linen, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { marginTop: 6, color: colors.ink, textAlign: 'center' },
  emptyBody: { maxWidth: 260, color: colors.textSecondary, textAlign: 'center' },
  emptyAction: { marginTop: 8, paddingHorizontal: 18 },
  alert: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10, backgroundColor: colors.alertBg },
  badge: { position: 'absolute', top: 4, right: 3, minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
