import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { CountBadge } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { useCartCount } from '@/store/cart';
import { useUiStore } from '@/store/ui';
import { colors, eyebrow, sans } from '@/theme';
import { pluralize } from '@/utils/format';

/** "Your café ▾" selector + cart + notifications. */
export function HomeHeader({ cafeName, unseenCount }: { cafeName: string; unseenCount: number }) {
  const cartCount = useCartCount();
  const openCafePicker = useUiStore((s) => s.openCafePicker);
  return (
    <View style={styles.row}>
      <Touchable onPress={() => openCafePicker()} accessibilityLabel={`Change café, currently ${cafeName}`} style={styles.cafe}>
        <Icon name="pin" size={20} strokeWidth={1.7} />
        <View style={styles.cafeText}>
          <Text style={[eyebrow(10, 0.12), { color: colors.textMuted }]}>Your café</Text>
          <View style={styles.cafeName}>
            <Text style={[sans(16, 600), { color: colors.ink }]}>{cafeName}</Text>
            <Icon name="chevronDown" size={12} strokeWidth={2.2} />
          </View>
        </View>
      </Touchable>
      <View style={styles.actions}>
        {cartCount > 0 ? (
          <Touchable onPress={() => router.push('/cart')} accessibilityLabel={cartCount ? `Your order, ${cartCount} ${pluralize(cartCount, 'item', 'items')}` : 'Your order'} style={styles.iconBtn}>
            <Icon name="bag" size={23} strokeWidth={1.6} />
            <CountBadge count={cartCount} />
          </Touchable>
        ) : null}
        <Touchable onPress={() => router.push('/notifications')} accessibilityLabel={unseenCount ? `Notifications, ${unseenCount} new` : 'Notifications'} style={styles.iconBtn}>
          <Icon name="bell" size={23} strokeWidth={1.6} />
          {unseenCount > 0 ? <CountBadge count={unseenCount} /> : null}
        </Touchable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingTop: 4, paddingRight: 10, paddingLeft: 8 },
  cafe: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 50, paddingHorizontal: 10, borderRadius: 12 },
  cafeText: { gap: 5 },
  cafeName: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actions: { flexDirection: 'row', alignItems: 'center' },
  iconBtn: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
