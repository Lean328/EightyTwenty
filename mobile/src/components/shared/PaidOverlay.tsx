import { StyleSheet, View } from 'react-native';
import Animated, { Keyframe } from 'react-native-reanimated';
import { Text } from '@/components/ui/Text';
import { useUiStore } from '@/store/ui';
import { colors, sans, serif } from '@/theme';
import { AnimatedCheck } from './AnimatedCheck';

const enter = new Keyframe({ 0: { opacity: 0 }, 100: { opacity: 1 } }).duration(180);
const leave = new Keyframe({ 0: { opacity: 1 }, 100: { opacity: 0 } }).duration(330);

/** Full-screen "Order placed." confirmation after payment (`@keyframes paidOverlay`, 1.5s). */
export function PaidOverlay() {
  const paid = useUiStore((s) => s.paidOverlay);
  if (!paid) return null;
  return (
    <Animated.View entering={enter} exiting={leave} pointerEvents="none" style={styles.overlay} accessibilityRole="alert" accessibilityLiveRegion="assertive">
      <View style={styles.inner}>
        <AnimatedCheck />
        <Text style={[serif(34, 400, 1, -0.015), styles.title]}>Order placed.</Text>
        <Text style={[sans(14, 400, 1.4), styles.line]}>{paid.line}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, zIndex: 70, backgroundColor: colors.cream, justifyContent: 'center' },
  inner: { alignItems: 'center', gap: 12, paddingHorizontal: 32 },
  title: { marginTop: 8, color: colors.ink },
  line: { color: colors.textSecondary, textAlign: 'center' },
});
