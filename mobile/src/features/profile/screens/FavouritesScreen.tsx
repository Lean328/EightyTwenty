import { Image } from 'expo-image';
import { useMemo } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { config } from '@/constants/config';
import { ScaleIn } from '@/components/layout/Rise';
import { Screen } from '@/components/layout/Screen';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { EmptyState, PopText } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { useCartActions, useCartQuantities } from '@/features/cart/hooks';
import { useMenu } from '@/features/menu/hooks';
import { useBottomSpace } from '@/hooks/useBottomSpace';
import { useGoToTab } from '@/navigation/tabNavigation';
import { useUiStore } from '@/store/ui';
import { colors, inkA, sans, shadows } from '@/theme';
import type { MenuItem } from '@/types';
import { formatMoney } from '@/utils/format';
import { useFavourites } from '../hooks';

/** Saved dishes with quick add / stepper. */
export function FavouritesScreen() {
  const goToTab = useGoToTab();
  const bottom = useBottomSpace(140, true);
  const { data: ids = [] } = useFavourites();
  const { data: menu = [] } = useMenu();
  const quantities = useCartQuantities();
  const { step, quickAdd } = useCartActions();
  const openItem = useUiStore((s) => s.openItem);
  const items = useMemo(() => ids.map((id) => menu.find((m) => m.id === id)).filter((m): m is MenuItem => !!m), [ids, menu]);

  return (
    <Screen>
      <ScreenHeader title="Favourites" />
      <FlatList
        data={items}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ paddingTop: 2, paddingHorizontal: 20, paddingBottom: bottom }}
        extraData={quantities}
        renderItem={({ item }) => {
          const qty = quantities[item.id] ?? 0;
          return (
            <View style={styles.row}>
              <Touchable onPress={() => openItem(item)} accessibilityLabel={item.name} style={styles.thumb}>
                {item.image ? <Image source={item.image} style={styles.fill} contentFit="cover" /> : null}
              </Touchable>
              <Touchable onPress={() => openItem(item)} style={styles.text}>
                <Text style={[sans(15, 600, 1.3), { color: colors.ink }]}>{item.name}</Text>
                {config.features.showPrices ? <Text style={[sans(14, 600), styles.price]}>{formatMoney(item.price)}</Text> : null}
              </Touchable>
              {qty > 0 ? (
                <ScaleIn style={styles.stepper}>
                  <Touchable onPress={() => step(item, -1)} accessibilityLabel={`Remove one ${item.name}`} style={styles.stepBtn}>
                    <Icon name="minus" size={16} strokeWidth={2.2} color={colors.ivory} />
                  </Touchable>
                  <View style={styles.qty}>
                    <PopText value={String(qty)} style={[sans(14, 600), { color: colors.ivory, textAlign: 'center' }]} />
                  </View>
                  <Touchable onPress={() => step(item, 1)} accessibilityLabel={`Add one ${item.name}`} style={styles.stepBtn}>
                    <Icon name="plus" size={16} strokeWidth={2.2} color={colors.ivory} />
                  </Touchable>
                </ScaleIn>
              ) : (
                <Touchable onPress={() => quickAdd(item)} accessibilityLabel={`Add ${item.name}`} style={styles.add}>
                  <Icon name="plus" size={18} strokeWidth={2} />
                </Touchable>
              )}
            </View>
          );
        }}
        ListEmptyComponent={<EmptyState icon="heart" title="No favourites yet" body="Tap the heart on any dish to keep it here." actionLabel="Browse the menu" actionVariant="primary" onAction={() => goToTab('menu')} />}
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { width: '100%', height: '100%' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: inkA(0.07) },
  thumb: { width: 72, height: 72, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.linen },
  text: { flex: 1, minWidth: 0 },
  price: { marginTop: 5, color: colors.ink },
  add: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.ivory, alignItems: 'center', justifyContent: 'center', ...shadows.roundButton, borderWidth: 1, borderColor: inkA(0.08) },
  stepper: { flexDirection: 'row', alignItems: 'center', height: 40, borderRadius: 12, backgroundColor: colors.ink, transformOrigin: 'right center' },
  stepBtn: { width: 38, height: 40, alignItems: 'center', justifyContent: 'center' },
  qty: { minWidth: 22, alignItems: 'center' },
});
