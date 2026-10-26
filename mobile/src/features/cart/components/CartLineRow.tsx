import { Image } from 'expo-image';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { PopText } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { TextAction } from '@/components/ui/Links';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { colors, inkA, sans, sansItalic } from '@/theme';
import type { CartLine } from '@/types';
import { formatMoney } from '@/utils/format';

interface CartLineRowProps {
  line: CartLine;
  canEdit: boolean;
  onChangeQty: (key: string, delta: number) => void;
  onRemove: (key: string) => void;
  onEdit: (line: CartLine) => void;
}

/** Cart line: photo, name + line total, options, note, stepper (bin at 1), Edit / Remove. */
export const CartLineRow = memo(function CartLineRow({ line, canEdit, onChangeQty, onRemove, onEdit }: CartLineRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.photo}>{line.image ? <Image source={line.image} style={styles.fill} contentFit="cover" /> : null}</View>
      <View style={styles.body}>
        <View style={styles.top}>
          <Text style={[sans(15, 600, 1.3), styles.name]}>{line.name}</Text>
          <Text style={[sans(14, 600), { color: colors.ink }]}>{formatMoney(line.unitPrice * line.qty)}</Text>
        </View>
        {line.modifiersLabel ? <Text style={[sans(12, 400, 1.4), styles.meta]}>{line.modifiersLabel}</Text> : null}
        {line.note ? <Text style={[sansItalic(12, 1.4), styles.meta]}>“{line.note}”</Text> : null}
        <View style={styles.controls}>
          <View style={styles.stepper}>
            <Touchable onPress={() => onChangeQty(line.key, -1)} accessibilityLabel={line.qty === 1 ? `Remove ${line.name}` : `Decrease ${line.name}`} style={styles.stepBtn}>
              {line.qty === 1 ? <Icon name="trash" size={16} strokeWidth={1.8} /> : <Icon name="minus" size={16} strokeWidth={2.2} />}
            </Touchable>
            <View style={styles.qty}>
              <PopText value={String(line.qty)} style={[sans(14, 600), { color: colors.ink, textAlign: 'center' }]} />
            </View>
            <Touchable onPress={() => onChangeQty(line.key, 1)} accessibilityLabel={`Increase ${line.name}`} style={styles.stepBtn}>
              <Icon name="plus" size={16} strokeWidth={2.2} />
            </Touchable>
          </View>
          <View style={styles.actions}>
            {canEdit ? <TextAction label="Edit" onPress={() => onEdit(line)} /> : null}
            <TextAction label="Remove" weight={500} color={colors.textSecondary} onPress={() => onRemove(line.key)} />
          </View>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 14, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: inkA(0.07) },
  photo: { width: 64, height: 64, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.linen },
  fill: { width: '100%', height: '100%' },
  body: { flex: 1, minWidth: 0 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
  name: { flex: 1, color: colors.ink },
  meta: { marginTop: 3, color: colors.textSecondary },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 10 },
  stepper: { flexDirection: 'row', alignItems: 'center', height: 38, borderRadius: 10, borderWidth: 1, borderColor: inkA(0.16), backgroundColor: colors.ivory },
  stepBtn: { width: 40, height: 38, alignItems: 'center', justifyContent: 'center' },
  qty: { minWidth: 22, alignItems: 'center' },
  actions: { flexDirection: 'row', gap: 16 },
});
