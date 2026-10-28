import { Image } from 'expo-image';
import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { config } from '@/constants/config';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { dietChips } from '@/domain/dietary';
import { colors, eyebrow, inkA, sans } from '@/theme';
import type { DietaryPreference, MenuItem } from '@/types';
import { formatMoney } from '@/utils/format';
import { QuantityInput } from './QuantityInput';

interface MenuItemRowProps {
  item: MenuItem;
  quantity: number;
  dietary: DietaryPreference[];
  onOpen: (item: MenuItem) => void;
  onStep: (item: MenuItem, delta: number) => void;
  onSet: (item: MenuItem, qty: number) => void;
}

/** 92pt photo · name, two-line description, price + dietary codes · stepper. */
export const MenuItemRow = memo(function MenuItemRow({ item, quantity, dietary, onOpen, onStep, onSet }: MenuItemRowProps) {
  const diets = useMemo(() => dietChips(item.dietary, dietary), [item.dietary, dietary]);
  return (
    <View style={styles.row}>
      <Touchable onPress={() => onOpen(item)} accessibilityLabel={item.name} style={styles.photo}>
        {item.image ? (
          <Image source={item.image} style={styles.img} contentFit="cover" recyclingKey={item.id} transition={150} />
        ) : (
          <View style={styles.noImg}>
            <Icon name="cupPlain" size={22} strokeWidth={1.5} color={colors.textMuted} />
          </View>
        )}
      </Touchable>
      <Touchable onPress={() => onOpen(item)} pressedOpacity={0.75} pressedScale={1} accessibilityHint="Shows details and options" style={styles.text}>
        <Text style={[sans(15, 600, 1.25, -0.005), { color: colors.ink }]}>{item.name}</Text>
        {item.description ? (
          <Text numberOfLines={2} style={[sans(12.5, 400, 1.4), { color: colors.textSecondary }]}>
            {item.description}
          </Text>
        ) : null}
        <View style={styles.priceRow}>
          {config.features.showPrices ? <Text style={[sans(15, 600), { color: colors.ink }]}>{formatMoney(item.price)}</Text> : null}
          {diets.length ? <Text style={[eyebrow(10, 0.1), { color: colors.caramelDeep, flexShrink: 1 }]}>{diets.map((d) => d.label).join(' · ')}</Text> : null}
        </View>
      </Touchable>
      <QuantityInput name={item.name} quantity={quantity} onStep={(d) => onStep(item, d)} onSet={(q) => onSet(item, q)} />
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: inkA(0.07) },
  photo: { width: 92, height: 92, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.linen },
  img: { width: '100%', height: '100%' },
  noImg: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, minWidth: 0, gap: 5 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 2 },
});
