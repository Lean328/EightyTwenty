import { useIsFocused } from 'expo-router';
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { AppState, Platform, StyleSheet, View, useWindowDimensions, type ViewStyle } from 'react-native';
import Animated, { runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming, type SharedValue } from 'react-native-reanimated';
import { Text } from '@/components/ui/Text';
import { colors, easing, serif } from '@/theme';

/**
 * Welcome-screen hero: the website's rotating dish orbit (lumi-hero), ported 1:1 —
 * same ring geometry, keyframe tracks, timings and GSAP eases, driven on the UI thread.
 * The headline crossfades in step with each dish.
 */
const DISHES = [
  require('../../../../assets/images/hero/mighty-breakfast.webp'),
  require('../../../../assets/images/hero/acai-bowl.webp'),
  require('../../../../assets/images/hero/breakfast-burger.webp'),
  require('../../../../assets/images/hero/french-toast.webp'),
  require('../../../../assets/images/hero/green-nourish-bowl.webp'),
];
/** Site copy and line breaks, verbatim, in dish order. */
export const HERO_COPY: [string, string][] = [
  ['Fuel your', 'morning.'],
  ['Brunch without', 'the fuss.'],
  ['Clean food.', 'Big flavour.'],
  ['Coffee worth', 'getting up for.'],
  ['Mindful by nature,', 'indulgent by choice.'],
];

const N = DISHES.length;
const REST = 1600;
const MOVE = 700;
const TEXT = 420;
const LEAD = 110;
const STAGE_H = 340;
const DISH = 340;

type Track = readonly (readonly [number, number])[];
const SCALE: Track = [[-2.5, 0.42], [-2, 0.48], [-1, 0.54], [0, 1], [1, 0.52], [2, 0.44], [2.5, 0.46]];
const TILT: Track = [[-2.5, 32], [-2, 26], [-1, 11], [0, 0], [1, -16], [2, -34], [2.5, -40]];
const ALPHA: Track = [[-2, 0], [-1, 1], [0, 1], [1, 1], [2, 0]];

function track(k: Track, p: number): number {
  'worklet';
  if (p <= k[0]![0]) return k[0]![1];
  const last = k.length - 1;
  if (p >= k[last]![0]) return k[last]![1];
  for (let i = 1; i <= last; i++) {
    if (p <= k[i]![0]) {
      const a = k[i - 1]!;
      const b = k[i]!;
      return a[1] + ((b[1] - a[1]) * (p - a[0])) / (b[0] - a[0]);
    }
  }
  return k[last]![1];
}

const STEP = 58;
const RX = 0.389;
const RY = 0.82;
const RAD = Math.PI / 180;
function baseX(p: number) {
  'worklet';
  return RX * Math.sin(p * STEP * RAD);
}
function baseY(p: number) {
  'worklet';
  return RY * (1 - Math.cos(p * STEP * RAD));
}
// Narrow-screen design lock from the site: the focus dish spans the width, wings sit wide and high.
const CORR_M1: [number, number] = [-0.48 - baseX(-1), 0.02 - baseY(-1)];
const CORR_0: [number, number] = [0 - baseX(0), 0 - baseY(0)];
const CORR_1: [number, number] = [0.47 - baseX(1), 0.04 - baseY(1)];

function corrAt(p: number): [number, number] {
  'worklet';
  let lo: [number, number];
  let hi: [number, number];
  let t: number;
  if (p >= 1) {
    lo = CORR_1;
    hi = [0, 0];
    t = Math.min(1, p - 1);
  } else if (p >= 0) {
    lo = CORR_0;
    hi = CORR_1;
    t = p;
  } else if (p >= -1) {
    lo = CORR_0;
    hi = CORR_M1;
    t = -p;
  } else {
    lo = CORR_M1;
    hi = [0, 0];
    t = Math.min(1, -p - 1);
  }
  return [lo[0] + (hi[0] - lo[0]) * t, lo[1] + (hi[1] - lo[1]) * t];
}

function ringP(k: number, pos: number) {
  'worklet';
  let d = (k - pos + N / 2) % N;
  if (d < 0) d += N;
  return d - N / 2;
}

const dishShadow: ViewStyle = Platform.select({
  ios: { shadowColor: colors.ink, shadowOpacity: 0.26, shadowRadius: 15, shadowOffset: { width: 0, height: 22 } },
  default: { filter: 'drop-shadow(0px 22px 30px rgba(28,24,20,0.26))' } as ViewStyle,
})!;

function Dish({ index, pos, width }: { index: number; pos: SharedValue<number>; width: number }) {
  const style = useAnimatedStyle(() => {
    const p = ringP(index, pos.value);
    const c = corrAt(p);
    return {
      opacity: track(ALPHA, p),
      zIndex: Math.round(34 - Math.abs(p) * 5 + p * 3),
      transform: [
        { translateX: (baseX(p) + c[0]) * width },
        { translateY: (baseY(p) + c[1]) * STAGE_H },
        { rotate: `${track(TILT, p)}deg` },
        { scale: track(SCALE, p) },
      ],
    };
  });
  return (
    <Animated.View style={[styles.dish, { left: width / 2 - DISH / 2, transformOrigin: '50% 70%' }, dishShadow, style]}>
      <Image source={DISHES[index]} style={styles.dishImg} contentFit="contain" contentPosition={{ left: '50%', bottom: 0 }} cachePolicy="memory-disk" />
    </Animated.View>
  );
}

/** Two stacked headline layers; the outgoing one lifts away while the next rises in. */
export function FoodOrbitHeadline({ layers }: { layers: HeadlineLayers }) {
  return (
    <View style={styles.headline} accessibilityRole="header">
      {[0, 1].map((i) => (
        <HeadlineLayer key={i} copy={layers.copy[i]!} y={layers.y[i]!} o={layers.o[i]!} live={layers.live === i} />
      ))}
    </View>
  );
}

function HeadlineLayer({ copy, y, o, live }: { copy: [string, string]; y: SharedValue<number>; o: SharedValue<number>; live: boolean }) {
  const [h, setH] = useState(88);
  const anim = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ translateY: (y.value / 100) * h }] }));
  return (
    <Animated.View
      style={[i_styles.layer, anim]}
      onLayout={(e) => setH(e.nativeEvent.layout.height)}
      aria-hidden={!live}
    >
      <Text style={i_styles.line} numberOfLines={1} adjustsFontSizeToFit>
        {copy[0]}
      </Text>
      <Text style={i_styles.line} numberOfLines={1} adjustsFontSizeToFit>
        {copy[1]}
      </Text>
    </Animated.View>
  );
}

export interface HeadlineLayers {
  copy: [string, string][];
  y: SharedValue<number>[];
  o: SharedValue<number>[];
  live: number;
}

/** Drives dishes + headline. Pauses when the screen is hidden or the app is backgrounded. */
export function useFoodOrbit() {
  const pos = useSharedValue(0);
  const y0 = useSharedValue(0);
  const y1 = useSharedValue(0);
  const o0 = useSharedValue(1);
  const o1 = useSharedValue(0);
  const [copy, setCopy] = useState<[string, string][]>([HERO_COPY[0]!, HERO_COPY[0]!]);
  const [live, setLive] = useState(0);
  const state = useRef({ active: 0, live: 0, timer: undefined as ReturnType<typeof setTimeout> | undefined, running: false });
  const focused = useIsFocused();
  const reduced = useReducedMotion();
  const [appActive, setAppActive] = useState(true);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setAppActive(s === 'active'));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const s = state.current;
    const run = focused && appActive && !reduced;
    s.running = run;
    const schedule = () => {
      clearTimeout(s.timer);
      if (s.running) s.timer = setTimeout(advance, REST);
    };
    const advance = () => {
      if (!s.running) return;
      const target = (s.active + 1) % N;
      const from = Math.round(pos.value);
      const into = 1 - s.live;
      const ys = [y0, y1];
      const os = [o0, o1];
      setCopy((c) => {
        const next = [...c] as [string, string][];
        next[into] = HERO_COPY[target]!;
        return next;
      });
      setLive(into);
      ys[into]!.value = 30;
      os[into]!.value = 0;
      // Headline: old lifts and fades, new rises into place.
      ys[s.live]!.value = withTiming(-28, { duration: TEXT * 0.8, easing: easing.easeIn2 });
      os[s.live]!.value = withTiming(0, { duration: TEXT * 0.8, easing: easing.easeIn2 });
      ys[into]!.value = withDelay(TEXT * 0.34, withTiming(0, { duration: TEXT, easing: easing.easeOut3 }));
      os[into]!.value = withDelay(TEXT * 0.34, withTiming(1, { duration: TEXT, easing: easing.easeOut3 }));
      // Dishes: one tween of the ring carries the whole composition (always forward).
      pos.value = withDelay(
        LEAD,
        withTiming(from + 1, { duration: MOVE, easing: easing.easeInOut2 }, (done) => {
          if (done) runOnJS(schedule)();
        }),
      );
      s.active = target;
      s.live = into;
    };
    if (run) schedule();
    return () => {
      s.running = false;
      clearTimeout(s.timer);
    };
  }, [focused, appActive, reduced, pos, y0, y1, o0, o1]);

  return { pos, layers: { copy, y: [y0, y1], o: [o0, o1], live } satisfies HeadlineLayers };
}

/** The 340pt dish stage, full screen width. */
export function FoodOrbitStage({ pos }: { pos: SharedValue<number> }) {
  const { width } = useWindowDimensions();
  return (
    <View style={styles.stage} pointerEvents="none" aria-hidden>
      {DISHES.map((_, i) => (
        <Dish key={i} index={i} pos={pos} width={width} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // Clipped so off-stage (transparent) dishes never create scrollable overflow; the opaque
  // action bar sits directly below, as in the prototype.
  stage: { alignSelf: 'stretch', height: STAGE_H, marginHorizontal: -16, marginTop: 'auto', overflow: 'hidden' },
  dish: { position: 'absolute', bottom: 0, width: DISH, height: DISH },
  dishImg: { width: '100%', height: '100%' },
  // Two lines of 42pt display type (layers are stacked, like the prototype's grid-area 1/1).
  headline: { marginTop: 12, width: '100%', height: 2 * Math.round(42 * 1.05) },
});

const i_styles = StyleSheet.create({
  layer: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center' },
  line: { ...serif(42, 500, 0.98, -0.025), color: colors.ink, textAlign: 'center' },
});
