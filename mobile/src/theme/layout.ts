import type { ViewStyle } from 'react-native';

/** Corner radii used across the prototype. */
export const radii = {
  xs: 6,
  sm: 10,
  md: 12,
  lg: 14,
  xl: 16,
  card: 20,
  sheet: 20,
  pill: 999,
} as const;

/** Page gutter and common spacing values. */
export const space = {
  gutter: 20,
  gutterTight: 14,
  gutterForm: 16,
} as const;

/**
 * Shadows written as CSS box-shadow strings (supported by React Native's New Architecture
 * and react-native-web), copied from the prototype.
 */
export const shadows = {
  card: { boxShadow: '0 10px 24px -20px rgba(28,24,20,0.35)' },
  loyaltyCard: { boxShadow: '0 20px 44px -26px rgba(28,24,20,0.4)' },
  quickAction: { boxShadow: '0 8px 20px -14px rgba(28,24,20,0.3)' },
  floating: { boxShadow: '0 16px 32px -14px rgba(28,24,20,0.6)' },
  tabBar: { boxShadow: '0 10px 26px -8px rgba(28,24,20,0.22)' },
  tabBubble: { boxShadow: '0 0 0 1px rgba(182,122,75,0.85), 0 6px 14px rgba(28,24,20,0.2)' },
  roundButton: { boxShadow: '0 2px 10px rgba(28,24,20,0.16)' },
  backButton: { boxShadow: '0 4px 14px rgba(28,24,20,0.18)' },
  giftCard: { boxShadow: '0 18px 36px -20px rgba(28,24,20,0.6)' },
  walletPass: { boxShadow: '0 16px 36px rgba(0,0,0,0.5)' },
  switchKnob: { boxShadow: '0 1px 3px rgba(28,24,20,0.3)' },
  segment: { boxShadow: '0 1px 3px rgba(28,24,20,0.16)' },
} satisfies Record<string, ViewStyle>;

/** Minimum comfortable touch target (Apple HIG 44pt). */
export const TOUCH_TARGET = 44;
