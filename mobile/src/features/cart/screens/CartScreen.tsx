import { router } from 'expo-router';
import { useCallback } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { config } from '@/constants/config';
import { Rise } from '@/components/layout/Rise';
import { Screen } from '@/components/layout/Screen';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { StickyFooter } from '@/components/layout/StickyFooter';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { isRewardReady, stampsToGo } from '@/domain/loyalty';
import { useSelectedLocation } from '@/features/locations/hooks';
import { useMenuIndex } from '@/features/menu/hooks';
import { useGoToTab } from '@/navigation/tabNavigation';
import { useCartStore } from '@/store/cart';
import { useUiStore } from '@/store/ui';
import { caramelA, colors, sans } from '@/theme';
import type { CartLine } from '@/types';
import { formatMoney } from '@/utils/format';
import { CartLineRow } from '../components/CartLineRow';
import { OrderContextRow } from '../components/OrderContextRow';
import { earnLine } from '../copy';
import { useCartTotals } from '../hooks';

export function CartScreen() {
  const goToTab = useGoToTab();
  const location = useSelectedLocation();
  const lines = useCartStore((s) => s.lines);
  const method = useCartStore((s) => s.context.method);
  const changeLineQty = useCartStore((s) => s.changeLineQty);
  const removeLine = useCartStore((s) => s.removeLine);
  const openItem = useUiStore((s) => s.openItem);
  const menu = useMenuIndex();
  const totals = useCartTotals();

  const onEdit = useCallback(
    (line: CartLine) => {
      const item = menu.get(line.itemId);
      if (item) openItem(item, { line });
    },
    [menu, openItem],
  );

  if (!lines.length) {
    return (
      <Screen>
        <ScreenHeader title="Your order" />
        <View style={styles.emptyWrap}>
          <EmptyState icon="bag" title="Your order is empty" body={`Add something from the ${location?.name ?? ''} menu.`} actionLabel="Browse the menu" actionVariant="primary" onAction={() => goToTab('menu')} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader title="Your order" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <OrderContextRow />
        <View style={styles.lines}>
          {lines.map((l) => (
            <CartLineRow key={l.key} line={l} canEdit={!!menu.get(l.itemId)?.modifierGroups.length} onChangeQty={changeLineQty} onRemove={removeLine} onEdit={onEdit} />
          ))}
          <Touchable onPress={() => goToTab('menu')} style={styles.addMore}>
            <Icon name="plus" size={15} strokeWidth={2.2} color={colors.caramelDeep} />
            <Text style={[sans(13, 600), { color: colors.caramelDeep }]}>Add more items</Text>
          </Touchable>
        </View>
        <Rise style={styles.earn}>
          <Icon name="cup" size={20} strokeWidth={1.7} color={colors.caramelDeep} />
          <Text style={[sans(13, 500, 1.4), styles.flex]}>{earnLine(isRewardReady(totals.stamps, totals.stampsPerReward), totals.coffeeCount, stampsToGo(totals.stamps, totals.stampsPerReward))}</Text>
        </Rise>
        <View style={styles.totals}>
          {config.features.showPrices ? <Row label="Subtotal" value={formatMoney(totals.subtotal)} /> : null}
          {config.features.showPrices && method === 'Delivery' ? <Row label="Delivery (10%)" value={'+' + formatMoney(totals.delivery)} /> : null}
          <Text style={[sans(12, 400, 1.4), styles.next]}>{config.features.ordering ? 'Gift card, coffee reward and payment come next.' : 'Ordering in the app is coming soon.'}</Text>
        </View>
      </ScrollView>
      {config.features.ordering ? (
        <StickyFooter>
          <Button onPress={() => router.push('/checkout')} height={56} radius={14} accessibilityLabel={config.features.showPrices ? `Go to checkout, ${formatMoney(totals.subtotal)}` : 'Go to checkout'}>
            <View style={styles.cta}>
              <Text style={[sans(15, 600), { color: colors.ivory }]}>Go to checkout</Text>
              {config.features.showPrices ? <Text style={[sans(15, 600), { color: colors.ivory }]}>{formatMoney(totals.subtotal)}</Text> : null}
            </View>
          </Button>
        </StickyFooter>
      ) : null}
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={[sans(14, 400, 1.3), { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[sans(14, 400, 1.3), { color: colors.ink }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, color: colors.ink },
  emptyWrap: { flex: 1, justifyContent: 'center', paddingBottom: 80 },
  content: { paddingBottom: 20 },
  lines: { paddingTop: 2, paddingHorizontal: 20 },
  addMore: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 10, paddingVertical: 8 },
  earn: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16, marginHorizontal: 20, padding: 14, borderRadius: 14, backgroundColor: caramelA(0.12) },
  totals: { gap: 8, marginTop: 18, marginHorizontal: 20 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  next: { marginTop: 2, color: colors.textMuted },
  cta: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', alignSelf: 'stretch', paddingHorizontal: 4 },
});
