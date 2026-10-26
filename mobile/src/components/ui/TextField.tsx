import { forwardRef, useState } from 'react';
import { Platform, StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle, type TextInputInstance } from 'react-native';
import { colors, espressoA, inkA, MAX_FONT_SCALE, sans } from '@/theme';
import { Text } from './Text';

/**
 * Text input styled like the prototype fields. Tones:
 * - `ink`: account/checkout fields (ink text, ink-alpha border)
 * - `espresso`: reserve & catering (website palette, red error border)
 */
export interface TextFieldProps extends TextInputProps {
  height?: number;
  radius?: number;
  background?: string;
  tone?: 'ink' | 'espresso';
  error?: boolean;
}

export const TextField = forwardRef<TextInputInstance, TextFieldProps>(function TextField(
  { height = 48, radius = 10, background = colors.ivory, tone = 'ink', error, style, multiline, onFocus, onBlur, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const espresso = tone === 'espresso';
  const border = error ? colors.dangerBright : espresso ? espressoA(0.2) : inkA(0.16);
  return (
    <TextInput
      ref={ref}
      placeholderTextColor={colors.textFaint}
      maxFontSizeMultiplier={MAX_FONT_SCALE}
      multiline={multiline}
      textAlignVertical={multiline ? 'top' : 'center'}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      style={[
        styles.input,
        sans(15),
        {
          height: multiline ? undefined : height,
          minHeight: multiline ? height : undefined,
          borderRadius: radius,
          backgroundColor: background,
          borderColor: border,
          color: espresso ? colors.espressoText : colors.ink,
          paddingVertical: multiline ? 12 : 0,
        },
        // Focus ring from the prototype CSS: 2px caramel outline.
        focused && styles.focused,
        style as StyleProp<TextStyle>,
      ]}
      {...rest}
    />
  );
});

/** Small field label above an input (`font: 500 12px Figtree`). */
export function FieldLabel({ children, optional, tone = 'espresso', style }: { children: string; optional?: boolean; tone?: 'ink' | 'espresso'; style?: StyleProp<TextStyle> }) {
  const color = tone === 'espresso' ? colors.espressoText : colors.ink;
  return (
    <Text style={[sans(12, 500), { color }, style]}>
      {children}
      {optional ? <Text style={[sans(12, 400), { color: colors.textWarmMuted }]}> (optional)</Text> : null}
    </Text>
  );
}

/** Label + field stack with the prototype's 6–8px gap. */
export function Field({ label, optional, gap = 6, children, style, tone }: { label: string; optional?: boolean; gap?: number; children: React.ReactNode; style?: StyleProp<ViewStyle>; tone?: 'ink' | 'espresso' }) {
  return (
    <View style={[{ gap }, style]}>
      <FieldLabel optional={optional} tone={tone}>
        {label}
      </FieldLabel>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, paddingHorizontal: 14 },
  focused: Platform.select({
    web: { outlineColor: colors.caramel, outlineWidth: 2, outlineStyle: 'solid', outlineOffset: 1 } as TextStyle,
    default: { borderColor: colors.caramel },
  })!,
});
