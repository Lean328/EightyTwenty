import { Text as RNText, type TextProps } from 'react-native';
import { colors, MAX_FONT_SCALE, sans } from '@/theme';

const base = { ...sans(14), color: colors.ink };

/**
 * App text: Figtree, ink colour, Dynamic Type capped at 1.3× so the editorial layouts hold.
 * Pass theme helpers for style, e.g. `style={[serif(30), { color: colors.ink }]}`.
 */
export function Text({ style, maxFontSizeMultiplier = MAX_FONT_SCALE, ...rest }: TextProps) {
  return <RNText {...rest} maxFontSizeMultiplier={maxFontSizeMultiplier} style={[base, style]} />;
}
