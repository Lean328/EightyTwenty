import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomSheet } from '@/components/layout/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Icon } from '@/components/ui/Icon';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { SelectField } from '@/components/ui/SelectField';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { Touchable } from '@/components/ui/Touchable';
import { ORDER_RULES } from '@/constants/business';
import { isOpenNow, opensAtLabel } from '@/domain/hours';
import { scheduleSlots } from '@/domain/schedule';
import { useSelectedLocation } from '@/features/locations/hooks';
import { useAddresses } from '@/features/profile/hooks';
import { useNow } from '@/hooks/useNow';
import { useCartStore } from '@/store/cart';
import { showToast, useUiStore } from '@/store/ui';
import { colors, inkA, sans } from '@/theme';
import type { FulfilmentMethod, TimeOfDay } from '@/types';

const METHODS: FulfilmentMethod[] = ['Pickup', 'Delivery', 'Dine In'];
const SLOTS = scheduleSlots();

/** "How would you like it?" — fulfilment method, café, timing, address / table. */
export function OrderSettingsSheet() {
  const open = useUiStore((s) => s.orderSettingsOpen);
  const setOpen = useUiStore((s) => s.setOrderSettingsOpen);
  const openCafePicker = useUiStore((s) => s.openCafePicker);
  const insets = useSafeAreaInsets();
  const now = useNow();
  const location = useSelectedLocation();
  const ctx = useCartStore((s) => s.context);
  const { setMethod, setTiming, setScheduledTime, setDeliveryAddress, setTableNumber } = useCartStore.getState();
  const { data: addresses = [] } = useAddresses();
  const [lastTime, setLastTime] = useState<TimeOfDay>('09:00');
  const offered = location?.methods ?? ['Pickup'];
  const isLater = ctx.timing.type === 'scheduled';
  const wait = location?.waitLabel ?? ORDER_RULES.defaultWait;
  const asapSub = location && isOpenNow(location, now) ? `About ${wait}` : `Opens ${location ? opensAtLabel(location, now) : ''}`;

  return (
    <BottomSheet visible={open} onClose={() => setOpen(false)} accessibilityLabel="Order settings" maxHeight="90%" handle>
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.body, { paddingBottom: Math.max(30, insets.bottom + 12) }]} keyboardShouldPersistTaps="handled">
        <Text accessibilityRole="header" style={[sans(19, 600, 1.2), styles.title]}>
          How would you like it?
        </Text>
        <SegmentedControl
          height={42}
          value={ctx.method}
          segments={METHODS.map((m) => ({ value: m, label: m, dimmed: !offered.includes(m) }))}
          onChange={(m) => (offered.includes(m) ? setMethod(m) : showToast(`${m} isn’t offered at ${location?.name ?? 'this café'}`))}
          style={styles.mt14}
        />
        <Touchable onPress={() => openCafePicker(true)} accessibilityLabel={`EightyTwenty ${location?.name}. Change café`} style={styles.cafe}>
          <Icon name="pin" size={20} strokeWidth={1.7} />
          <View style={styles.flex}>
            <Text style={[sans(14.5, 600, 1.2), { color: colors.ink }]}>EightyTwenty {location?.name}</Text>
            <Text style={[sans(12.5, 400, 1.3), styles.address]}>{location?.address}</Text>
          </View>
          <Text style={[sans(13, 600), { color: colors.caramelDeep }]}>Change</Text>
        </Touchable>

        <Text style={[sans(13, 600), styles.label]}>When</Text>
        <View style={styles.when}>
          <TimingCard title="As soon as possible" sub={asapSub} selected={!isLater} onPress={() => setTiming({ type: 'asap' })} />
          <TimingCard title="Later today" sub="Pick a time" selected={isLater} onPress={() => setScheduledTime(lastTime)} />
        </View>
        {isLater ? (
          <SelectField
            value={ctx.timing.type === 'scheduled' ? ctx.timing.time : lastTime}
            options={SLOTS}
            onChange={(t) => {
              setLastTime(t);
              setScheduledTime(t);
            }}
            accessibilityLabel="Time"
            title="Pick a time"
            height={48}
            radius={12}
            style={styles.mt8}
          />
        ) : null}

        {ctx.method === 'Delivery' ? (
          <>
            <Text style={[sans(13, 600), styles.label]}>Deliver to</Text>
            <TextField value={ctx.deliveryAddress} onChangeText={setDeliveryAddress} placeholder="Street address, suburb" accessibilityLabel="Delivery address" autoComplete="street-address" textContentType="fullStreetAddress" radius={12} />
            {addresses.length ? (
              <View style={styles.chips}>
                {addresses.map((a) => (
                  <Chip key={a.id} label={a.label} selected={false} onPress={() => setDeliveryAddress(a.line)} weight={600} fontSize={12.5} radius={17} />
                ))}
              </View>
            ) : null}
            <Text style={[sans(12, 400, 1.4), styles.note]}>Delivery adds 10% to your order.</Text>
          </>
        ) : null}
        {ctx.method === 'Dine In' ? (
          <>
            <Text style={[sans(13, 600), styles.label]}>Table number</Text>
            <TextField value={ctx.tableNumber} onChangeText={setTableNumber} placeholder="e.g. 12" accessibilityLabel="Table number" keyboardType="number-pad" radius={12} />
          </>
        ) : null}
        <Button label="Done" onPress={() => setOpen(false)} height={54} radius={14} fontSize={15} style={styles.done} />
      </ScrollView>
    </BottomSheet>
  );
}

function TimingCard({ title, sub, selected, onPress }: { title: string; sub: string; selected: boolean; onPress: () => void }) {
  return (
    <Touchable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected }} style={[styles.timing, { borderColor: selected ? colors.ink : inkA(0.14) }]}>
      <Text style={[sans(14, 600, 1.1), { color: colors.ink }]}>{title}</Text>
      <Text style={[sans(12, 400, 1.1), { color: colors.textSecondary }]}>{sub}</Text>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  scroll: { flexShrink: 1 },
  body: { paddingHorizontal: 20 },
  flex: { flex: 1, minWidth: 0 },
  title: { marginTop: 14, color: colors.ink },
  mt14: { marginTop: 14 },
  mt8: { marginTop: 8 },
  cafe: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: inkA(0.1), backgroundColor: colors.ivory },
  address: { marginTop: 3, color: colors.textSecondary },
  label: { marginTop: 18, marginBottom: 8, color: colors.ink },
  when: { flexDirection: 'row', gap: 8 },
  timing: { flex: 1, height: 62, justifyContent: 'center', gap: 5, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, backgroundColor: colors.ivory },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  note: { marginTop: 8, color: colors.textMuted },
  done: { marginTop: 20 },
});
