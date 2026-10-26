import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import Animated, { Keyframe } from 'react-native-reanimated';
import { Icon } from '@/components/ui/Icon';
import { PopText } from '@/components/ui/Feedback';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { useMiniCartSummary } from '@/features/cart/hooks';
import { colors, easing, ivoryA, sans, shadows } from '@/theme';

const miniIn = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: 16 }] },
  100: { opacity: 1, transform: [{ translateY: 0 }], easing: easing.standard },
}).duration(300);
const miniOut = new Keyframe({ 0: { opacity: 1, transform: [{ translateY: 0 }] }, 100: { opacity: 0, transform: [{ translateY: 16 }] } }).duration(200);

/** Floating "View cart" bar above the tab bar while the cart has items. */
export function MiniCart({ bottom, locationName }: { bottom: number; locationName: string }) {
  const { count, label, sub } = useMiniCartSummary(locationName);
  return (
    <Animated.View entering={miniIn} exiting={miniOut} style={[styles.wrap, { bottom }]}>
      <Touchable onPress={() => router.push('/cart')} accessibilityLabel={`View cart, ${label}`} style={styles.bar}>
        <View style={styles.left}>
          <View style={styles.count}>
            <PopText value={String(count)} style={[sans(15, 700), { color: colors.ivory }]} />
          </View>
          <View style={styles.texts}>
            <Text numberOfLines={1} style={[sans(14, 600), { color: colors.ivory }]}>
              {label}
            </Text>
            <Text numberOfLines={1} style={[sans(12), { color: ivoryA(0.66) }]}>
              {sub}
            </Text>
          </View>
        </View>
        <View style={styles.cta}>
          <Text style={[sans(13, 600), { color: colors.sand }]}>View cart</Text>
          <Icon name="chevronRight" size={14} strokeWidth={2.2} color={colors.sand} />
        </View>
      </Touchable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12, zIndex: 34 },
  bar: { height: 56, borderRadius: 14, backgroundColor: colors.ink, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, ...shadows.floating },
  left: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 },
  count: { width: 40, height: 40, borderRadius: 11, backgroundColor: ivoryA(0.1), alignItems: 'center', justifyContent: 'center' },
  texts: { gap: 5, flex: 1, minWidth: 0 },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 12, paddingRight: 6 },
});
