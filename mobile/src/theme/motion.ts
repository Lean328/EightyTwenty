import { Easing } from 'react-native-reanimated';

/**
 * Motion tokens translated from the prototype's CSS keyframes and transitions.
 * Reanimated animations respect the OS "Reduce Motion" setting by default
 * (ReduceMotion.System), matching the prototype's prefers-reduced-motion rule.
 */
export const easing = {
  /** cubic-bezier(.2,.8,.2,1) — the prototype's default "rise"/"push" curve */
  standard: Easing.bezier(0.2, 0.8, 0.2, 1),
  /** cubic-bezier(.2,.9,.25,1) — bottom sheets */
  sheet: Easing.bezier(0.2, 0.9, 0.25, 1),
  /** cubic-bezier(.22,1,.36,1) — welcome screen + catering accents */
  gentle: Easing.bezier(0.22, 1, 0.36, 1),
  /** cubic-bezier(.3,1.18,.4,1) — tab-bar bubble (slight overshoot) */
  tabBubble: Easing.bezier(0.3, 1.18, 0.4, 1),
  /** cubic-bezier(.3,1.5,.5,1) — badge pop */
  pop: Easing.bezier(0.3, 1.5, 0.5, 1),
  /** GSAP eases used by the welcome hero */
  easeIn2: Easing.in(Easing.quad),
  easeOut3: Easing.out(Easing.cubic),
  easeInOut2: Easing.inOut(Easing.quad),
  linear: Easing.linear,
  ease: Easing.bezier(0.25, 0.1, 0.25, 1),
} as const;

export const duration = {
  fast: 150,
  tabSwitch: 200,
  backdrop: 220,
  toast: 260,
  sheet: 320,
  rise: 360,
  tabBubble: 500,
  toastVisible: 2200,
  paidOverlay: 1500,
} as const;
