import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, espressoA, inkA, sans } from '@/theme';
import { Icon } from './Icon';
import { Text } from './Text';
import { Touchable } from './Touchable';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

interface SelectFieldProps<T extends string> {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  accessibilityLabel: string;
  title?: string;
  height?: number;
  radius?: number;
  background?: string;
  tone?: 'ink' | 'espresso';
  style?: StyleProp<ViewStyle>;
}

/**
 * Native replacement for the prototype's `<select>`: a field that opens a short option
 * list in a modal sheet (works above other sheets, e.g. inside "How would you like it?").
 */
export function SelectField<T extends string>({ value, options, onChange, accessibilityLabel, title, height = 46, radius = 10, background = colors.ivory, tone = 'ink', style }: SelectFieldProps<T>) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const current = options.find((o) => o.value === value);
  const ink = tone === 'ink';
  return (
    <>
      <Touchable
        onPress={() => setOpen(true)}
        pressedScale={1}
        accessibilityLabel={`${accessibilityLabel}: ${current?.label ?? ''}`}
        accessibilityHint="Opens a list of options"
        style={[styles.field, { height, borderRadius: radius, backgroundColor: background, borderColor: ink ? inkA(0.16) : espressoA(0.2) }, style]}
      >
        <Text style={[sans(15, ink ? 500 : 400), { color: ink ? colors.ink : colors.espressoText, flex: 1 }]} numberOfLines={1}>
          {current?.label ?? ''}
        </Text>
        <Icon name="chevronDown" size={14} strokeWidth={2} color={ink ? colors.ink : colors.textWarmMuted} />
      </Touchable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)} statusBarTranslucent navigationBarTranslucent>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: Math.max(24, insets.bottom + 8) }]} accessibilityViewIsModal>
          <View style={styles.handle} />
          {title ? <Text style={[sans(17, 600), styles.title]}>{title}</Text> : null}
          <ScrollView style={styles.list}>
            {options.map((o, i) => {
              const on = o.value === value;
              return (
                <Touchable
                  key={o.value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  onPress={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  pressedScale={1}
                  style={[styles.option, i > 0 && styles.optionSep]}
                >
                  <Text style={[sans(15, on ? 600 : 400), { color: colors.ink, flex: 1 }]}>{o.label}</Text>
                  {on ? <Icon name="check" size={18} strokeWidth={2.4} /> : null}
                </Touchable>
              );
            })}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderWidth: 1 },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(28,24,20,0.42)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '70%', backgroundColor: colors.cream, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 10, paddingHorizontal: 20 },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: inkA(0.18) },
  title: { marginTop: 14, marginBottom: 6, color: colors.ink },
  list: { marginTop: 4 },
  option: { flexDirection: 'row', alignItems: 'center', minHeight: 50 },
  optionSep: { borderTopWidth: 1, borderTopColor: inkA(0.07) },
});
