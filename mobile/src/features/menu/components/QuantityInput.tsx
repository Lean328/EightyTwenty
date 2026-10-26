import { memo, useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useDerivedValue, withTiming } from 'react-native-reanimated';
import { Icon } from '@/components/ui/Icon';
import { Touchable } from '@/components/ui/Touchable';
import { colors, inkA, MAX_FONT_SCALE, sans } from '@/theme';

interface QuantityInputProps {
  name: string;
  quantity: number;
  onStep: (delta: number) => void;
  onSet: (quantity: number) => void;
}

/**
 * Menu row stepper: minus / editable quantity / plus. Turns ink when the item is in the cart.
 * Typing sets the item's total (0 removes it); commits on blur or Done.
 */
export const QuantityInput = memo(function QuantityInput({ name, quantity, onStep, onSet }: QuantityInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const inCart = quantity > 0;
  const active = useDerivedValue(() => withTiming(inCart ? 1 : 0, { duration: 200 }), [inCart]);
  const pill = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(active.value, [0, 1], ['rgba(0,0,0,0)', colors.ink]),
    borderColor: interpolateColor(active.value, [0, 1], [inkA(0.2), colors.ink]),
  }));
  const fg = inCart ? colors.ivory : colors.ink;
  const minusDisabled = quantity === 0 && draft === null;

  const commit = () => {
    if (draft !== null && draft !== '') onSet(parseInt(draft, 10));
    setDraft(null);
  };

  return (
    <Animated.View style={[styles.pill, pill]}>
      <Touchable
        onPress={() => onStep(-1)}
        disabled={minusDisabled}
        pressedOpacity={0.6}
        pressedScale={1}
        accessibilityLabel={`Remove one ${name}`}
        style={[styles.btn, { opacity: minusDisabled ? 0.35 : 1 }]}
      >
        <Icon name="minus" size={14} strokeWidth={2.2} color={fg} />
      </Touchable>
      <TextInput
        value={draft ?? String(quantity)}
        onChangeText={(t) => setDraft(t.replace(/\D/g, '').slice(0, 2))}
        onFocus={() => setDraft(String(quantity))}
        onBlur={commit}
        onSubmitEditing={commit}
        selectTextOnFocus
        keyboardType="number-pad"
        returnKeyType="done"
        maxLength={2}
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        accessibilityLabel={`Quantity of ${name}`}
        style={[styles.input, sans(14, 600), { color: fg }]}
      />
      <Touchable onPress={() => onStep(1)} pressedOpacity={0.6} pressedScale={1} accessibilityLabel={`Add one ${name}`} style={styles.btn}>
        <Icon name="plus" size={14} strokeWidth={2.2} color={fg} />
      </Touchable>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', height: 36, borderWidth: 1, borderRadius: 18 },
  btn: { width: 32, height: 36, alignItems: 'center', justifyContent: 'center' },
  input: { width: 30, height: 28, padding: 0, textAlign: 'center' },
});
