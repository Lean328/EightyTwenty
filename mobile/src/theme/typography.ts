import { Platform, type TextStyle } from 'react-native';

/**
 * Font families loaded in app/_layout.tsx.
 * Newsreader (headings, editorial) and Figtree (body/interface), as in the prototype.
 */
export const fontFamilies = {
  serif: {
    300: 'Newsreader_300Light',
    400: 'Newsreader_400Regular',
    500: 'Newsreader_500Medium',
  },
  serifItalic: {
    300: 'Newsreader_300Light_Italic',
    400: 'Newsreader_400Regular_Italic',
  },
  sans: {
    400: 'Figtree_400Regular',
    500: 'Figtree_500Medium',
    600: 'Figtree_600SemiBold',
    700: 'Figtree_700Bold',
  },
  sansItalic: {
    400: 'Figtree_400Regular_Italic',
  },
  /** Native system face — used where the prototype mimics Apple chrome (Wallet, Apple Pay). */
  system: Platform.select({ ios: 'System', default: undefined }),
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
} as const;

type SerifWeight = keyof typeof fontFamilies.serif;
type SansWeight = keyof typeof fontFamilies.sans;

/**
 * Converts a CSS line-height ratio to points.
 * Ratios at or below 1 are single-line UI labels in the prototype (`font: 600 10px/1`);
 * React Native clips glyphs with such tight boxes on Android, so those use the natural
 * line height instead. Tight multi-line display type is clamped to 1.05.
 */
function lineHeightFor(size: number, ratio?: number): number | undefined {
  if (ratio === undefined || ratio <= 1) return undefined;
  return Math.round(size * Math.max(ratio, 1.05));
}

const androidText: TextStyle = Platform.OS === 'android' ? { includeFontPadding: false } : {};

/** Newsreader. `letterSpacingEm` mirrors CSS `letter-spacing` in em. */
export function serif(size: number, weight: SerifWeight = 400, lineHeight?: number, letterSpacingEm = 0): TextStyle {
  return {
    fontFamily: fontFamilies.serif[weight],
    fontSize: size,
    lineHeight: lineHeightFor(size, lineHeight),
    letterSpacing: letterSpacingEm ? letterSpacingEm * size : undefined,
    ...androidText,
  };
}

export function serifItalic(size: number, weight: 300 | 400 = 400, lineHeight?: number, letterSpacingEm = 0): TextStyle {
  return { ...serif(size, 400, lineHeight, letterSpacingEm), fontFamily: fontFamilies.serifItalic[weight] };
}

/** Figtree. */
export function sans(size: number, weight: SansWeight = 400, lineHeight?: number, letterSpacingEm = 0): TextStyle {
  return {
    fontFamily: fontFamilies.sans[weight],
    fontSize: size,
    lineHeight: lineHeightFor(size, lineHeight),
    letterSpacing: letterSpacingEm ? letterSpacingEm * size : undefined,
    ...androidText,
  };
}

export function sansItalic(size: number, lineHeight?: number): TextStyle {
  return { ...sans(size, 400, lineHeight), fontFamily: fontFamilies.sansItalic[400] };
}

/** Small uppercase eyebrow labels: `font: 600 10px/1 Figtree; letter-spacing:.12em; uppercase`. */
export function eyebrow(size = 10, letterSpacingEm = 0.12, weight: SansWeight = 600): TextStyle {
  return { ...sans(size, weight, 1, letterSpacingEm), textTransform: 'uppercase' };
}

/** Upper bound for Dynamic Type scaling so the editorial layouts don't break. */
export const MAX_FONT_SCALE = 1.3;
