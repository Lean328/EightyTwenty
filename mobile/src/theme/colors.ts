/**
 * EightyTwenty colour tokens — values copied from the approved prototype CSS.
 * Name colours by role, not by hex, so screens read as intent ("ink", "caramel").
 */
export const colors = {
  // Surfaces (warm ivory → cream → linen)
  cream: '#F5F0E8', // app background / sticky bars
  creamWarm: '#FAEDDD', // welcome + auth sheet
  ivory: '#FCF9F4', // cards, list groups, light text on dark buttons
  oat: '#EFE8DC', // home lower band, wallet button, profile status shield
  linen: '#ECE4D7', // image placeholders, segmented controls, icon tiles
  linenDeep: '#ECE4D6', // reserve/catering placeholders
  parchment: '#E8DECD', // featured café card
  skeleton: '#E6DCCC',
  disabled: '#DDD3C4',
  placeholderTile: '#E3D9C8',
  imageWell: '#D9CDBA',

  // Reserve & catering (website-derived palette)
  sandstone: '#F3EEE5',
  sandstoneCard: '#F8F4EC',

  // Ink & espresso
  ink: '#1C1814', // near-black type and primary buttons
  espresso: '#4B2E26', // menu header, loyalty, reserve CTAs
  espressoText: '#3A2B24', // reserve/catering body type
  cocoa: '#5E423A', // category thumbnails on the espresso header
  charcoal: '#211B17', // gift card banner
  charcoalSoft: '#2A2320', // reward header
  charcoalWarm: '#3A2E27',

  // Type
  textSecondary: '#574A40',
  textMuted: '#74655A',
  textFaint: '#9A8B80',
  textAuth: '#5C4A41',
  textWarmMuted: '#7A6259',
  creamText: '#F5EDE2',

  // Accents (restrained caramel)
  caramel: '#B67A4B',
  caramelDeep: '#8B5827',
  sand: '#E9C89E',
  brandRed: '#C45441',

  // Status
  success: '#3E6B47',
  successBg: '#EEF1E4',
  successText: '#4E6538',
  danger: '#9A4436',
  dangerBright: '#B4431F',
  alertBg: '#FBE9E4',
  alertText: '#8A2E1C',

  // Native wallet / Apple Pay chrome
  black: '#000000',
  white: '#FFFFFF',
  walletSheet: '#161616',
  iosBlue: '#0A84FF',
  walletInk: '#2A1E18',
} as const;

/** rgba(28,24,20,a) — the ink colour at an opacity, used for hairlines and borders. */
export const inkA = (a: number) => `rgba(28,24,20,${a})`;
/** rgba(75,46,38,a) — espresso at an opacity (reserve & catering borders). */
export const espressoA = (a: number) => `rgba(75,46,38,${a})`;
/** rgba(245,237,226,a) — cream text at an opacity (on dark surfaces). */
export const creamA = (a: number) => `rgba(245,237,226,${a})`;
/** rgba(252,249,244,a) — ivory at an opacity. */
export const ivoryA = (a: number) => `rgba(252,249,244,${a})`;
/** rgba(182,122,75,a) — caramel at an opacity. */
export const caramelA = (a: number) => `rgba(182,122,75,${a})`;

export type ColorToken = keyof typeof colors;
