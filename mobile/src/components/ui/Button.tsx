import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, fontFamilies, inkA, sans } from '@/theme';
import { Text } from './Text';
import { Touchable } from './Touchable';

export type ButtonVariant = 'primary' | 'outline' | 'espresso' | 'espressoOutline' | 'applePay' | 'disabled';

const VARIANTS: Record<ButtonVariant, { bg: string; fg: string; border?: string; borderWidth?: number }> = {
  primary: { bg: colors.ink, fg: colors.ivory },
  outline: { bg: 'transparent', fg: colors.ink, border: inkA(0.18), borderWidth: 1 },
  espresso: { bg: colors.espresso, fg: colors.sandstone },
  espressoOutline: { bg: 'transparent', fg: colors.espresso, border: colors.espresso, borderWidth: 1.5 },
  applePay: { bg: colors.black, fg: colors.white },
  disabled: { bg: colors.disabled, fg: colors.textSecondary },
};

interface ButtonProps {
  label?: string;
  children?: ReactNode;
  onPress?: () => void;
  variant?: ButtonVariant;
  height?: number;
  radius?: number;
  /** Figtree weight/size for the label (prototype buttons are 600 13–15px, reserve uses 500). */
  weight?: 400 | 500 | 600 | 700;
  fontSize?: number;
  /** Apple Pay buttons use the system font, like the prototype. */
  systemFont?: boolean;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

/** The prototype's filled/outlined buttons. Layout props (width, margins) come via `style`. */
export function Button({
  label,
  children,
  onPress,
  variant = 'primary',
  height = 50,
  radius = 12,
  weight = 600,
  fontSize = 14,
  systemFont,
  loading,
  disabled,
  style,
  accessibilityLabel,
}: ButtonProps) {
  const v = VARIANTS[variant];
  return (
    <Touchable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      style={[
        styles.base,
        { height, borderRadius: radius, backgroundColor: v.bg, borderColor: v.border, borderWidth: v.borderWidth ?? 0 },
        style,
      ]}
    >
      {loading ? (
        <View style={styles.row}>
          <ActivityIndicator size="small" color={v.fg} />
          <Text style={[sans(fontSize, weight), { color: v.fg }]}>Processing…</Text>
        </View>
      ) : (
        (children ?? (
          <Text numberOfLines={1} style={[sans(fontSize, weight), { color: v.fg }, systemFont && { fontFamily: fontFamilies.system }]}>
            {label}
          </Text>
        ))
      )}
    </Touchable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
