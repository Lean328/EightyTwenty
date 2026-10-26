import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, espressoA, inkA, sans } from '@/theme';
import type { TimeOfDay } from '@/types';
import { formatTimeOfDay, pad2 } from '@/utils/format';
import { Button } from './Button';
import { Text } from './Text';
import { Touchable } from './Touchable';

export interface TimeFieldProps {
  value: TimeOfDay | '';
  onChange: (value: TimeOfDay) => void;
  accessibilityLabel: string;
  placeholder?: string;
  invalid?: boolean;
  height?: number;
}

function toDate(value: string): Date {
  const d = new Date();
  if (/^\d{2}:\d{2}$/.test(value)) d.setHours(parseInt(value, 10), parseInt(value.slice(3), 10), 0, 0);
  else d.setHours(9, 0, 0, 0);
  return d;
}

const fromDate = (d: Date): TimeOfDay => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

/**
 * Native equivalent of the prototype's free `<input type="time" step="60">`:
 * Android shows the system clock dialog, iOS a spinner in a sheet. Any minute is allowed;
 * validation against opening hours happens in domain/reservations.ts.
 */
export function TimeField({ value, onChange, accessibilityLabel, placeholder = 'Select a time', invalid, height = 46 }: TimeFieldProps) {
  const [iosOpen, setIosOpen] = useState(false);
  const [draft, setDraft] = useState<Date>(toDate(value));
  const insets = useSafeAreaInsets();

  const open = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: toDate(value),
        mode: 'time',
        is24Hour: false,
        onChange: (e: DateTimePickerEvent, d?: Date) => {
          if (e.type === 'set' && d) onChange(fromDate(d));
        },
      });
    } else {
      setDraft(toDate(value));
      setIosOpen(true);
    }
  };

  const color = invalid ? colors.dangerBright : value ? colors.espressoText : colors.textWarmMuted;
  return (
    <>
      <Touchable
        onPress={open}
        pressedScale={1}
        accessibilityLabel={`${accessibilityLabel}${value ? ', ' + formatTimeOfDay(value) : ''}`}
        accessibilityHint={invalid ? 'Time is not available' : undefined}
        style={[styles.field, { height, borderColor: invalid ? colors.dangerBright : espressoA(0.2) }]}
      >
        <Text numberOfLines={1} style={[sans(15), { color }]}>
          {value ? formatTimeOfDay(value) : placeholder}
        </Text>
      </Touchable>
      {Platform.OS === 'ios' ? (
        <Modal visible={iosOpen} transparent animationType="fade" onRequestClose={() => setIosOpen(false)}>
          <Pressable style={styles.backdrop} onPress={() => setIosOpen(false)} accessibilityLabel="Close" />
          <View style={[styles.sheet, { paddingBottom: Math.max(24, insets.bottom + 8) }]} accessibilityViewIsModal>
            <View style={styles.handle} />
            <DateTimePicker value={draft} mode="time" display="spinner" minuteInterval={1} onChange={(_, d) => d && setDraft(d)} textColor={colors.ink} />
            <Button
              label="Done"
              onPress={() => {
                onChange(fromDate(draft));
                setIosOpen(false);
              }}
              height={52}
              radius={14}
            />
          </View>
        </Modal>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  field: { justifyContent: 'center', paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, backgroundColor: colors.sandstoneCard, minWidth: 0 },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(58,43,36,0.35)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.sandstone, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingTop: 10, paddingHorizontal: 18 },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: inkA(0.18) },
});
