import { useCallback, useMemo, useRef } from 'react';
import { FlatList, StyleSheet, View, type ListRenderItem } from 'react-native';
import { config } from '@/constants/config';
import { Rise } from '@/components/layout/Rise';
import { Screen } from '@/components/layout/Screen';
import { ErrorState, Skeleton } from '@/components/ui/Feedback';
import { Text } from '@/components/ui/Text';
import { lowestPackagePrice } from '@/domain/catering';
import { orderContextTitle, orderTimingLabel } from '@/features/cart/copy';
import { useCartActions, useCartQuantities } from '@/features/cart/hooks';
import { useCateringPackages } from '@/features/catering/hooks';
import { useSelectedLocation } from '@/features/locations/hooks';
import { usePreferences } from '@/features/profile/hooks';
import { useBottomSpace } from '@/hooks/useBottomSpace';
import { useNow } from '@/hooks/useNow';
import { useTabReselect } from '@/hooks/useTabReselect';
import { errorMessage } from '@/services/errors';
import { useCartCount, useCartStore } from '@/store/cart';
import { useUiStore } from '@/store/ui';
import { colors, inkA, sans, serif } from '@/theme';
import type { MenuItem } from '@/types';
import { formatMoneyCompact } from '@/utils/format';
import { MenuHeader } from '../components/MenuHeader';
import { MenuItemRow } from '../components/MenuItemRow';
import { QuickActions } from '../components/QuickActions';
import { useCategories, useMenu } from '../hooks';
import { useMenuStore } from '../menuStore';

/** Menu: category rail, reserve/catering shortcuts and the item list for the selected café. */
export function MenuScreen() {
  const list = useRef<FlatList<MenuItem>>(null);
  const scrollY = useRef(0);
  const railY = useRef(0);
  const now = useNow();
  const location = useSelectedLocation();
  const context = useCartStore((s) => s.context);
  const cartCount = useCartCount();
  const quantities = useCartQuantities();
  const { step, setQuantity } = useCartActions();
  const openItem = useUiStore((s) => s.openItem);
  const setOrderSettingsOpen = useUiStore((s) => s.setOrderSettingsOpen);
  const categoryId = useMenuStore((s) => s.categoryId);
  const setCategory = useMenuStore((s) => s.setCategory);
  const { data: categories = [] } = useCategories();
  const menu = useMenu();
  const { data: packages = [] } = useCateringPackages();
  const { data: prefs } = usePreferences();
  const dietary = useMemo(() => prefs?.dietary ?? [], [prefs]);
  const bottom = useBottomSpace(cartCount > 0 ? 84 : 20);
  useTabReselect('menu', () => list.current?.scrollToOffset({ offset: 0, animated: true }));

  const categoryCards = useMemo(
    () => categories.map((c) => ({ ...c, image: menu.data?.find((m) => m.categoryId === c.id && m.image)?.image ?? null })),
    [categories, menu.data],
  );
  const items = useMemo(() => (menu.data ?? []).filter((m) => m.categoryId === categoryId), [menu.data, categoryId]);
  const category = categories.find((c) => c.id === categoryId);

  const chooseCategory = useCallback(
    (id: string) => {
      if (id === useMenuStore.getState().categoryId) return;
      setCategory(id);
      // Keep the category rail in view when switching from further down the list.
      if (scrollY.current > railY.current) list.current?.scrollToOffset({ offset: railY.current, animated: false });
    },
    [setCategory],
  );

  const renderItem = useCallback<ListRenderItem<MenuItem>>(
    ({ item }) => (
      <View style={styles.gutter}>
        <MenuItemRow item={item} quantity={quantities[item.id] ?? 0} dietary={dietary} onOpen={openItem} onStep={step} onSet={setQuantity} />
      </View>
    ),
    [quantities, dietary, openItem, step, setQuantity],
  );

  const header = (
    <>
      <View>
        <MenuHeader
          onRailLayout={(y) => (railY.current = y)}
          contextTitle={orderContextTitle(context, location)}
          contextSub={orderTimingLabel(context, location, now)}
          cartCount={cartCount}
          categories={categoryCards}
          activeCategory={categoryId}
          onCategory={chooseCategory}
          onChangeContext={() => setOrderSettingsOpen(true)}
        />
      </View>
      <View style={styles.panel}>
        <QuickActions cateringFrom={config.features.showPrices ? `From ${formatMoneyCompact(lowestPackagePrice(packages))} pp` : 'For your team'} />
        <View style={styles.catHeading}>
          <Text accessibilityRole="header" style={[serif(26, 400, 1, -0.014), { color: colors.ink }]}>
            {category?.name ?? ''}
          </Text>
          {category?.note ? <Text style={[sans(12, 400, 1.3), styles.catNote]}>{category.note}</Text> : null}
        </View>
      </View>
    </>
  );

  return (
    <Screen background={colors.cream} shieldColor={colors.espresso} statusBar="light" grain={false}>
      {menu.isError ? (
        <>
          {header}
          <ErrorState message={errorMessage(menu.error)} onRetry={() => menu.refetch()} />
        </>
      ) : (
        <FlatList
          ref={list}
          data={menu.isLoading ? [] : items}
          keyExtractor={(m) => m.id}
          renderItem={renderItem}
          extraData={quantities}
          ListHeaderComponent={header}
          ListEmptyComponent={menu.isLoading ? <MenuSkeleton /> : undefined}
          ListFooterComponent={
            menu.isLoading ? undefined : (
              <Rise key={categoryId} distance={4} duration={220} style={styles.gutter}>
                <Text style={[sans(11, 400, 1.55), styles.legend]}>GF gluten free · DF dairy free · VG vegan · V vegetarian · opt on request.</Text>
              </Rise>
            )
          }
          contentContainerStyle={{ paddingBottom: bottom }}
          onScroll={(e) => (scrollY.current = e.nativeEvent.contentOffset.y)}
          scrollEventThrottle={32}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          initialNumToRender={8}
          windowSize={7}
          removeClippedSubviews
        />
      )}
    </Screen>
  );
}

function MenuSkeleton() {
  return (
    <View style={styles.gutter} accessibilityLabel="Loading menu">
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={styles.skelRow}>
          <Skeleton style={styles.skelImg} />
          <View style={styles.skelText}>
            <Skeleton delay={100} style={[styles.skelLine, { width: '60%', height: 13 }]} />
            <Skeleton delay={200} style={[styles.skelLine, { width: '90%', height: 10 }]} />
            <Skeleton delay={300} style={[styles.skelLine, { width: 40, height: 13 }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { marginTop: -26, paddingTop: 18, borderTopLeftRadius: 26, borderTopRightRadius: 26, backgroundColor: colors.cream },
  catHeading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, paddingTop: 24, paddingHorizontal: 20, paddingBottom: 4 },
  catNote: { color: colors.textMuted, textAlign: 'right', flexShrink: 1 },
  gutter: { paddingHorizontal: 20 },
  legend: { marginTop: 10, color: colors.textMuted },
  skelRow: { flexDirection: 'row', gap: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: inkA(0.07) },
  skelImg: { width: 92, height: 92, borderRadius: 14 },
  skelText: { flex: 1, gap: 9, justifyContent: 'center' },
  skelLine: { borderRadius: 5 },
});
