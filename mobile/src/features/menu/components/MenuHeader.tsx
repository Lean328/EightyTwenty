import { router } from 'expo-router';
import { Image } from 'expo-image';
import { memo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Rise } from '@/components/layout/Rise';
import { CountBadge } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { colors, creamA, sans, serif } from '@/theme';
import type { ImageSource, MenuCategory } from '@/types';
import { pluralize } from '@/utils/format';

interface MenuHeaderProps {
  contextTitle: string;
  contextSub: string;
  cartCount: number;
  categories: (MenuCategory & { image: ImageSource | null })[];
  activeCategory: string;
  onCategory: (id: string) => void;
  onChangeContext: () => void;
  /** Reports the category rail's y offset (the prototype's catMarkRef). */
  onRailLayout?: (y: number) => void;
}

/** Espresso header: title, cart, "Pickup from Phillip · Change", circular category rail. */
export const MenuHeader = memo(function MenuHeader({ contextTitle, contextSub, cartCount, categories, activeCategory, onCategory, onChangeContext, onRailLayout }: MenuHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <Text accessibilityRole="header" style={[serif(32, 400, 1, -0.018), { color: colors.creamText }]}>
          Menu
        </Text>
        <Touchable onPress={() => router.push('/cart')} accessibilityLabel={cartCount ? `Your order, ${cartCount} ${pluralize(cartCount, 'item', 'items')}` : 'Your order'} style={styles.cartBtn}>
          <Icon name="bag" size={22} strokeWidth={1.6} color={colors.creamText} />
          {cartCount > 0 ? <CountBadge count={cartCount} background={colors.sand} borderColor={colors.espresso} /> : null}
        </Touchable>
      </View>
      <Rise delay={0} duration={320}>
        <Touchable onPress={onChangeContext} pressedScale={1} accessibilityLabel={`${contextTitle}, ${contextSub}. Change`} style={styles.context}>
          <Icon name="bag" size={17} strokeWidth={1.8} color={colors.sand} />
          <View style={styles.contextText}>
            <Text numberOfLines={1} style={[sans(13.5, 600, 1.1), { color: colors.creamText }]}>
              {contextTitle}
            </Text>
            <Text numberOfLines={1} style={[sans(11.5, 400, 1.1), { color: creamA(0.72) }]}>
              {contextSub}
            </Text>
          </View>
          <Text style={[sans(12.5, 600), { color: colors.sand }]}>Change</Text>
        </Touchable>
      </Rise>
      <View onLayout={(e) => onRailLayout?.(e.nativeEvent.layout.y)} />
      <Rise delay={40} duration={340}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catsScroll} contentContainerStyle={styles.cats} accessibilityRole="tablist">
          {categories.map((c) => {
            const on = c.id === activeCategory;
            return (
              <Touchable
                key={c.id}
                onPress={() => onCategory(c.id)}
                pressedScale={0.96}
                pressedOpacity={1}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                accessibilityLabel={c.name}
                style={[styles.cat, { opacity: on ? 1 : 0.78 }]}
              >
                <View style={[styles.ring, { borderColor: on ? colors.sand : creamA(0.22) }]}>
                  <View style={styles.thumb}>
                    {c.image ? <Image source={c.image} style={styles.img} contentFit="cover" /> : <Icon name="cupPlain" size={22} strokeWidth={1.5} color={colors.sand} />}
                  </View>
                </View>
                <Text numberOfLines={1} style={[sans(12, on ? 600 : 500), { color: colors.creamText }]}>
                  {c.shortName}
                </Text>
              </Touchable>
            );
          })}
        </ScrollView>
      </Rise>
    </View>
  );
});

const styles = StyleSheet.create({
  header: { paddingTop: 6, paddingBottom: 44, backgroundColor: colors.espresso },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 20, paddingRight: 10 },
  cartBtn: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  context: { flexDirection: 'row', alignItems: 'center', gap: 11, height: 48, marginTop: 12, marginHorizontal: 20, paddingHorizontal: 14, borderWidth: 1, borderColor: creamA(0.16), borderRadius: 12, backgroundColor: creamA(0.1) },
  contextText: { flex: 1, minWidth: 0, gap: 3 },
  catsScroll: { marginTop: 18 },
  cats: { gap: 14, paddingTop: 2, paddingHorizontal: 20 },
  cat: { width: 66, alignItems: 'center', gap: 8 },
  ring: { width: 62, height: 62, borderRadius: 31, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  thumb: { width: 52, height: 52, borderRadius: 26, overflow: 'hidden', backgroundColor: colors.cocoa, alignItems: 'center', justifyContent: 'center' },
  img: { width: '100%', height: '100%' },
});
