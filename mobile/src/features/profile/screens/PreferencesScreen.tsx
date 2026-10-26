import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { KeyboardAwareScrollView } from '@/components/layout/KeyboardAwareScrollView';
import { Reveal } from '@/components/layout/Rise';
import { Screen } from '@/components/layout/Screen';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Icon } from '@/components/ui/Icon';
import { TextAction } from '@/components/ui/Links';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { Touchable } from '@/components/ui/Touchable';
import { DIETARY_OPTIONS } from '@/domain/dietary';
import { useSelectedLocation } from '@/features/locations/hooks';
import { useBottomSpace } from '@/hooks/useBottomSpace';
import { showToast, useUiStore } from '@/store/ui';
import { colors, inkA, sans } from '@/theme';
import type { AddressLabel } from '@/types';
import { useAddAddress, useAddresses, usePreferences, useRemoveAddress, useUpdatePreferences } from '../hooks';

const LABELS: AddressLabel[] = ['Home', 'Work', 'Other'];

/** Home café, dietary preferences (highlighted on the menu, pre-filled for catering), saved addresses. */
export function PreferencesScreen() {
  const bottom = useBottomSpace(132);
  const location = useSelectedLocation();
  const openCafePicker = useUiStore((s) => s.openCafePicker);
  const { data: prefs } = usePreferences();
  const update = useUpdatePreferences();
  const { data: addresses = [] } = useAddresses();
  const add = useAddAddress();
  const remove = useRemoveAddress();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState<AddressLabel>('Home');
  const [line, setLine] = useState('');
  const dietary = prefs?.dietary ?? [];

  const save = () => {
    if (!line.trim()) return;
    add.mutate(
      { label, line },
      {
        onSuccess: () => {
          setOpen(false);
          setLine('');
          setLabel('Home');
          showToast('Address saved');
        },
      },
    );
  };

  return (
    <Screen>
      <ScreenHeader title="Preferences" />
      <KeyboardAwareScrollView contentContainerStyle={[styles.content, { paddingBottom: bottom }]}>
        <Text accessibilityRole="header" style={[sans(17, 600, 1.25, -0.01), styles.h2]}>
          Home café
        </Text>
        <Touchable onPress={() => openCafePicker()} accessibilityLabel={`Home café, ${location?.name}. Change`} style={styles.cafe}>
          <View style={styles.thumb}>{location?.image ? <Image source={location.image} style={styles.fill} contentFit="cover" /> : null}</View>
          <View style={styles.flex}>
            <Text style={[sans(15, 600, 1.2), { color: colors.ink }]}>{location?.name}</Text>
            <Text style={[sans(12.5, 400, 1.3), styles.sub]}>{location?.area}</Text>
          </View>
          <Text style={[sans(13, 600), styles.change]}>Change</Text>
        </Touchable>

        <Text accessibilityRole="header" style={[sans(17, 600, 1.25, -0.01), styles.h2Spaced]}>
          Dietary
        </Text>
        <Text style={[sans(13, 400, 1.45), styles.sub6]}>We’ll highlight matching dishes on the menu and pre-fill catering requests.</Text>
        <View style={styles.chips}>
          {DIETARY_OPTIONS.map((d) => {
            const on = dietary.includes(d.name);
            return (
              <Chip
                key={d.name}
                label={d.name}
                selected={on}
                weight={600}
                fontSize={13}
                height={40}
                radius={20}
                style={styles.dietChip}
                onPress={() => update.mutate({ dietary: on ? dietary.filter((x) => x !== d.name) : [...dietary, d.name] })}
                trailing={<Text style={[sans(10, 600), { opacity: 0.7, color: on ? colors.ivory : colors.ink }]}>{d.code}</Text>}
              />
            );
          })}
        </View>

        <Text accessibilityRole="header" style={[sans(17, 600, 1.25, -0.01), styles.h2Spaced]}>
          Saved addresses
        </Text>
        {addresses.length ? (
          <View style={styles.addresses}>
            {addresses.map((a) => (
              <View key={a.id} style={styles.address}>
                <Icon name="pin" size={18} strokeWidth={1.7} />
                <View style={styles.flex}>
                  <Text style={[sans(14, 600, 1.25), { color: colors.ink }]}>{a.label}</Text>
                  <Text style={[sans(12.5, 400, 1.3), styles.sub]}>{a.line}</Text>
                </View>
                <TextAction label="Remove" color={colors.danger} onPress={() => remove.mutate(a.id)} />
              </View>
            ))}
          </View>
        ) : (
          <Text style={[sans(13, 400, 1.45), styles.sub8]}>No saved addresses yet. Saved addresses appear as quick picks for delivery.</Text>
        )}
        {open ? (
          <Reveal style={styles.form}>
            <View style={styles.labels}>
              {LABELS.map((x) => (
                <Chip key={x} label={x} selected={label === x} onPress={() => setLabel(x)} height={36} radius={18} weight={600} fontSize={13} style={styles.labelChip} />
              ))}
            </View>
            <TextField value={line} onChangeText={setLine} placeholder="Street address, suburb" accessibilityLabel="Address" autoComplete="street-address" background={colors.cream} />
            <Button label="Save address" onPress={save} loading={add.isPending} height={48} />
          </Reveal>
        ) : (
          <Touchable onPress={() => setOpen(true)} style={styles.add}>
            <Icon name="plus" size={16} strokeWidth={2.2} />
            <Text style={[sans(14, 600), { color: colors.ink }]}>Add an address</Text>
          </Touchable>
        )}
      </KeyboardAwareScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  fill: { width: '100%', height: '100%' },
  content: { paddingTop: 8, paddingHorizontal: 20 },
  h2: { color: colors.ink },
  h2Spaced: { marginTop: 30, color: colors.ink },
  cafe: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 12, padding: 10, borderRadius: 14, borderWidth: 1, borderColor: inkA(0.08), backgroundColor: colors.ivory },
  thumb: { width: 52, height: 52, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.linen },
  sub: { marginTop: 3, color: colors.textSecondary },
  sub6: { marginTop: 6, color: colors.textSecondary },
  sub8: { marginTop: 8, color: colors.textSecondary },
  change: { paddingRight: 6, color: colors.caramelDeep },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  dietChip: { paddingHorizontal: 14 },
  addresses: { gap: 8, marginTop: 12 },
  address: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.ivory, borderWidth: 1, borderColor: inkA(0.08) },
  form: { gap: 10, marginTop: 12, padding: 14, borderRadius: 14, backgroundColor: colors.ivory, borderWidth: 1, borderColor: inkA(0.08) },
  labels: { flexDirection: 'row', gap: 8 },
  labelChip: { paddingHorizontal: 14 },
  add: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 50, marginTop: 12, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: inkA(0.28) },
});
