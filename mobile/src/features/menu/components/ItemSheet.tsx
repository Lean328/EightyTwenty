import { Image } from 'expo-image';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { config } from '@/constants/config';
import { BottomSheet } from '@/components/layout/BottomSheet';
import { Button } from '@/components/ui/Button';
import { PopText } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { RoundIconButton } from '@/components/ui/Links';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { Touchable } from '@/components/ui/Touchable';
import { ORDER_RULES } from '@/constants/business';
import { dietChips } from '@/domain/dietary';
import { defaultSelections, firstMissingGroup, toggleOption, unitPrice } from '@/domain/pricing';
import { useFavourites, usePreferences, useToggleFavourite } from '@/features/profile/hooks';
import { useCartStore } from '@/store/cart';
import { showToast, useUiStore } from '@/store/ui';
import { caramelA, colors, inkA, sans } from '@/theme';
import type { MenuItem, ModifierGroup, ModifierSelections } from '@/types';
import { formatMoney } from '@/utils/format';

/** Global item sheet (opened from the menu, Home rail, favourites and cart "Edit"). */
export function ItemSheet() {
  const state = useUiStore((s) => s.item);
  const close = useUiStore((s) => s.closeItem);
  // Keep rendering the last item while the sheet animates closed.
  const [last, setLast] = useState(state);
  if (state && state !== last) setLast(state);
  const current = state ?? last;
  return (
    <BottomSheet visible={!!state} onClose={close} accessibilityLabel={current?.item.name ?? 'Item'} maxHeight="92%">
      {current ? <ItemSheetBody key={current.item.id + (current.line?.key ?? '')} item={current.item} lineKey={current.line?.key} initial={current.line ? { selections: current.line.selections, qty: current.line.qty, note: current.line.note } : { selections: defaultSelections(current.item), qty: Math.max(1, current.initialQty ?? 1), note: '' }} onClose={close} /> : null}
    </BottomSheet>
  );
}

function ItemSheetBody({ item, lineKey, initial, onClose }: { item: MenuItem; lineKey?: string; initial: { selections: ModifierSelections; qty: number; note: string }; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [selections, setSelections] = useState(initial.selections);
  const [qty, setQty] = useState(initial.qty);
  const [note, setNote] = useState(initial.note);
  const { data: favourites = [] } = useFavourites();
  const { data: prefs } = usePreferences();
  const toggleFav = useToggleFavourite();
  const fav = favourites.includes(item.id);
  const missing = firstMissingGroup(item, selections);
  const unit = unitPrice(item, selections);
  const diets = dietChips(item.dietary, prefs?.dietary ?? []);

  const add = () => {
    if (missing) return;
    const cart = useCartStore.getState();
    if (lineKey) {
      cart.updateLine(lineKey, item, selections, qty, note);
      showToast('Updated ' + item.name);
    } else {
      cart.addItem(item, selections, qty, note);
    }
    onClose();
  };

  const addLabel = missing ? 'Choose ' + missing.name.toLowerCase().replace(/^choose /, '') : `${lineKey ? 'Update order' : 'Add to order'}${config.features.showPrices ? ` — ${formatMoney(unit * qty)}` : ''}`;

  return (
    <View style={styles.body}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {item.image ? (
          <View style={styles.hero}>
            <Image source={item.image} style={styles.fill} contentFit="cover" accessibilityLabel={item.name} />
          </View>
        ) : (
          <View style={styles.noHero} />
        )}
        <View style={styles.content}>
          <View style={styles.titleRow}>
            <Text accessibilityRole="header" style={[sans(21, 600, 1.25, -0.01), styles.name]}>
              {item.name}
            </Text>
            {config.features.showPrices ? <Text style={[sans(16, 600, 1.2), { color: colors.ink }]}>{formatMoney(item.price)}</Text> : null}
          </View>
          {item.description ? <Text style={[sans(14, 400, 1.5), styles.desc]}>{item.description}</Text> : null}
          {diets.length ? (
            <View style={styles.diets}>
              {diets.map((d) => (
                <View key={d.label} style={[styles.diet, { borderColor: d.highlighted ? caramelA(0.65) : inkA(0.14) }]}>
                  <Text style={[sans(10.5, 600), { color: d.highlighted ? colors.caramelDeep : colors.textSecondary }]}>{d.label}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {item.modifierGroups.map((g) => (
            <ModifierGroupView key={g.id} group={g} selected={selections[g.id] ?? []} onToggle={(name) => setSelections((s) => toggleOption(g, s, name))} />
          ))}
          <View style={styles.noteBlock}>
            <Text style={[sans(15, 600, 1.2), { color: colors.ink }]}>Note for the kitchen</Text>
            <TextField value={note} onChangeText={setNote} placeholder="Optional" accessibilityLabel="Note for the kitchen" height={46} style={sans(14)} returnKeyType="done" />
          </View>
        </View>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: Math.max(30, insets.bottom + 12) }]}>
        <View style={styles.stepper}>
          <Touchable onPress={() => setQty((q) => Math.max(1, q - 1))} accessibilityLabel="Decrease quantity" style={styles.stepBtn}>
            <Icon name="minus" size={16} strokeWidth={2.2} />
          </Touchable>
          <View style={styles.qty}>
            <PopText value={String(qty)} style={[sans(15, 600), { color: colors.ink, textAlign: 'center' }]} duration={200} />
          </View>
          <Touchable onPress={() => setQty((q) => Math.min(ORDER_RULES.maxItemQty, q + 1))} accessibilityLabel="Increase quantity" style={styles.stepBtn}>
            <Icon name="plus" size={16} strokeWidth={2.2} />
          </Touchable>
        </View>
        <Button label={addLabel} onPress={add} disabled={!!missing} variant={missing ? 'disabled' : 'primary'} height={54} radius={14} fontSize={15} style={styles.add} />
      </View>
      <View style={styles.floating}>
        <RoundIconButton
          icon="heart"
          iconSize={19}
          color={fav ? colors.danger : colors.ink}
          fill={fav ? colors.danger : 'none'}
          accessibilityLabel={fav ? 'Remove from favourites' : 'Save to favourites'}
          onPress={() => {
            toggleFav.mutate({ itemId: item.id, favourite: !fav });
            showToast(fav ? 'Removed from favourites' : 'Saved to favourites');
          }}
        />
        <RoundIconButton icon="close" accessibilityLabel="Close" onPress={onClose} />
      </View>
    </View>
  );
}

function ModifierGroupView({ group, selected, onToggle }: { group: ModifierGroup; selected: string[]; onToggle: (name: string) => void }) {
  const single = group.maxSelections === 1;
  const need = group.required && !selected.length;
  const rule = group.required ? (selected.length ? 'Selected' : 'Required') : single ? 'Optional' : 'Add any';
  return (
    <View style={styles.group} accessibilityRole={single ? 'radiogroup' : undefined} accessibilityLabel={group.name}>
      <View style={styles.groupHead}>
        <Text style={[sans(15, 600, 1.2), { color: colors.ink, flexShrink: 1 }]}>{group.name}</Text>
        <View style={[styles.rule, { backgroundColor: need ? 'rgba(154,68,54,0.1)' : colors.linen }]}>
          <Text style={[sans(11, 600), { color: need ? colors.danger : colors.textSecondary }]}>{rule}</Text>
        </View>
      </View>
      <View style={styles.options}>
        {group.options.map((o, i) => {
          const on = selected.includes(o.name);
          return (
            <Touchable
              key={o.name}
              onPress={() => onToggle(o.name)}
              accessibilityRole={single ? 'radio' : 'checkbox'}
              accessibilityState={{ checked: on }}
              accessibilityLabel={o.price && config.features.showPrices ? `${o.name}, plus ${formatMoney(o.price)}` : o.name}
              style={[styles.option, i > 0 && styles.optionSep]}
            >
              <View style={[styles.mark, { borderRadius: single ? 10 : 6, borderColor: on ? colors.ink : inkA(0.28), backgroundColor: on && !single ? colors.ink : 'transparent' }]}>
                {on && single ? <View style={styles.dot} /> : null}
                {on && !single ? <Icon name="check" size={12} strokeWidth={3} color={colors.ivory} /> : null}
              </View>
              <Text style={[sans(14, 400, 1.3), styles.optionLabel]}>{o.name}</Text>
              {o.price && config.features.showPrices ? <Text style={[sans(13), { color: colors.textSecondary }]}>+{formatMoney(o.price)}</Text> : null}
            </Touchable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flexShrink: 1 },
  scroll: { flexGrow: 0, flexShrink: 1 },
  scrollContent: { paddingBottom: 4 },
  hero: { height: 240, backgroundColor: colors.linen },
  noHero: { height: 56 },
  fill: { width: '100%', height: '100%' },
  content: { paddingTop: 18, paddingHorizontal: 20, paddingBottom: 20 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 14 },
  name: { flex: 1, minWidth: 0, color: colors.ink },
  desc: { marginTop: 8, color: colors.textSecondary },
  diets: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  diet: { height: 22, paddingHorizontal: 7, borderRadius: 6, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  group: { marginTop: 22 },
  groupHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  rule: { height: 22, paddingHorizontal: 8, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  options: { marginTop: 8, paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.ivory, borderWidth: 1, borderColor: inkA(0.08) },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  optionSep: { borderTopWidth: 1, borderTopColor: inkA(0.07) },
  mark: { width: 20, height: 20, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.ink },
  optionLabel: { flex: 1, color: colors.ink },
  noteBlock: { marginTop: 22, gap: 8 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 12, paddingHorizontal: 20, backgroundColor: colors.cream, borderTopWidth: 1, borderTopColor: inkA(0.08) },
  stepper: { flexDirection: 'row', alignItems: 'center', height: 54, borderRadius: 14, borderWidth: 1, borderColor: inkA(0.16), backgroundColor: colors.ivory },
  stepBtn: { width: 44, height: 54, alignItems: 'center', justifyContent: 'center' },
  qty: { minWidth: 22, alignItems: 'center' },
  add: { flex: 1, minWidth: 0, paddingHorizontal: 14 },
  floating: { position: 'absolute', top: 12, right: 12, zIndex: 2, flexDirection: 'row', gap: 8 },
});
