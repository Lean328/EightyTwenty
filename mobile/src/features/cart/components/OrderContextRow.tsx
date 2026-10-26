import { StyleSheet, View } from 'react-native';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { useSelectedLocation } from '@/features/locations/hooks';
import { useNow } from '@/hooks/useNow';
import { useCartStore } from '@/store/cart';
import { useUiStore } from '@/store/ui';
import { colors, inkA, sans } from '@/theme';
import { orderContextTitle, orderTimingLabel } from '../copy';

/** "📍 Pickup from Phillip · ASAP … · Change" row at the top of the cart. */
export function OrderContextRow() {
  const now = useNow();
  const location = useSelectedLocation();
  const ctx = useCartStore((s) => s.context);
  const setOpen = useUiStore((s) => s.setOrderSettingsOpen);
  const title = orderContextTitle(ctx, location);
  const sub = orderTimingLabel(ctx, location, now);
  return (
    <Touchable onPress={() => setOpen(true)} accessibilityLabel={`${title}, ${sub}. Change`} style={styles.row}>
      <View style={styles.icon}>
        <Icon name="pin" size={18} strokeWidth={1.7} color={colors.caramelDeep} />
      </View>
      <View style={styles.text}>
        <Text numberOfLines={1} style={[sans(14, 600, 1.15), { color: colors.ink }]}>
          {title}
        </Text>
        <Text numberOfLines={1} style={[sans(12, 400, 1.15), { color: colors.textSecondary }]}>
          {sub}
        </Text>
      </View>
      <Text style={[sans(13, 600), { color: colors.caramelDeep }]}>Change</Text>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, marginHorizontal: 20, borderBottomWidth: 1, borderBottomColor: inkA(0.1) },
  icon: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, minWidth: 0, gap: 4 },
});
