import { useIsFocused } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, PanResponder, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useAnySheetOpen } from '@/store/ui';
import { easing } from '@/theme';

/**
 * Home "stage" carousel from the prototype: layered slides that auto-advance every 4.6s,
 * swipe left/right, pause on touch (resume 3.8s after), and stop while a sheet is open,
 * the screen is hidden, the app is backgrounded or Reduce Motion is on.
 *  - `wipe`: the new slide is revealed left→right (clip) while its photo settles 16pt.
 *  - `fade`: crossfade with a slow 4% Ken Burns zoom.
 * Captions rise in 220ms after each slide.
 */
const DWELL = 4600;
const RESUME = 3800;

/**
 * Animated styles each slide applies to its photo and caption. Apply them only to
 * `Animated.View`s (they are Reanimated style handles typed as plain styles here so the
 * render prop stays simple).
 */
export interface SlideAnimation {
  image: StyleProp<ViewStyle>;
  caption: StyleProp<ViewStyle>;
}

interface RailProps<T> {
  items: T[];
  mode: 'wipe' | 'fade';
  height: number;
  keyOf: (item: T) => string;
  renderSlide: (item: T, index: number, anim: SlideAnimation) => ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function Rail<T>({ items, mode, height, keyOf, renderSlide, style }: RailProps<T>) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [appActive, setAppActive] = useState(true);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const focused = useIsFocused();
  const sheetOpen = useAnySheetOpen();
  const reduced = useReducedMotion();
  const n = items.length;
  const go = useCallback((i: number) => n && setIndex(((i % n) + n) % n), [n]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setAppActive(s === 'active'));
    return () => {
      sub.remove();
      clearTimeout(resumeTimer.current);
    };
  }, []);

  const running = n > 1 && focused && appActive && !sheetOpen && !paused && !reduced;
  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => go(index + 1), DWELL);
    return () => clearTimeout(t);
  }, [running, index, go]);

  const pause = () => {
    clearTimeout(resumeTimer.current);
    setPaused(true);
  };
  const scheduleResume = () => {
    clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => setPaused(false), RESUME);
  };

  // Auto-advance pauses on touch, so `index` never changes mid-swipe.
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderTerminationRequest: () => false,
        onPanResponderRelease: (_, g) => {
          if (Math.abs(g.dx) > 28) go(index + (g.dx < 0 ? 1 : -1));
        },
      }),
    [go, index],
  );

  return (
    <View
      style={[{ height }, style]}
      onTouchStart={pause}
      onTouchEnd={scheduleResume}
      onTouchCancel={scheduleResume}
      accessibilityRole="adjustable"
      accessibilityValue={{ min: 1, max: n, now: index + 1 }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => go(index + (e.nativeEvent.actionName === 'increment' ? 1 : -1))}
      {...pan.panHandlers}
    >
      {items.map((item, i) => (
        <Slide key={keyOf(item)} active={i === index} mode={mode}>
          {(anim) => renderSlide(item, i, anim)}
        </Slide>
      ))}
    </View>
  );
}

function Slide({ active, mode, children }: { active: boolean; mode: 'wipe' | 'fade'; children: (anim: SlideAnimation) => ReactNode }) {
  const wipe = mode === 'wipe';
  const opacity = useSharedValue(active ? 1 : 0);
  const reveal = useSharedValue(1);
  const imgX = useSharedValue(0);
  const imgScale = useSharedValue(1);
  const cap = useSharedValue(active ? 1 : 0);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return; // initial render is instant, like the prototype
    }
    if (active) {
      if (wipe) {
        opacity.value = 1;
        reveal.value = 0;
        reveal.value = withTiming(1, { duration: 720, easing: easing.standard });
        imgX.value = -16;
        imgX.value = withTiming(0, { duration: 720, easing: easing.standard });
      } else {
        opacity.value = 0;
        opacity.value = withTiming(1, { duration: 550, easing: easing.ease });
        imgScale.value = 1;
        imgScale.value = withTiming(1.04, { duration: DWELL + 600, easing: Easing.linear });
      }
      cap.value = 0;
      cap.value = withDelay(220, withTiming(1, { duration: 550, easing: easing.standard }));
    } else {
      opacity.value = withDelay(250, withTiming(0, { duration: 450, easing: easing.ease }));
      cap.value = 0;
    }
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  const slide = useAnimatedStyle(() => ({ opacity: opacity.value, width: `${reveal.value * 100}%` as `${number}%` }));
  const image = useAnimatedStyle(() => ({ transform: [{ translateX: imgX.value }, { scale: imgScale.value }] }));
  const caption = useAnimatedStyle(() => ({ opacity: cap.value, transform: [{ translateY: (1 - cap.value) * 10 }] }));

  return (
    <Animated.View
      style={[styles.slide, { zIndex: active ? 2 : 1 }, slide]}
      pointerEvents={active ? 'auto' : 'none'}
      aria-hidden={!active}
    >
      <FullWidth>{children({ image: image as StyleProp<ViewStyle>, caption: caption as StyleProp<ViewStyle> })}</FullWidth>
    </Animated.View>
  );
}

/** Keeps slide content at the rail's full width while the wipe clips its container. */
function FullWidth({ children }: { children: ReactNode }) {
  const [w, setW] = useState<number | null>(null);
  return (
    <View style={StyleSheet.absoluteFill} onLayout={(e) => w === null && setW(e.nativeEvent.layout.width)}>
      <View style={[styles.full, w ? { width: w } : { right: 0 }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  slide: { position: 'absolute', top: 0, left: 0, bottom: 0, overflow: 'hidden' },
  full: { position: 'absolute', top: 0, left: 0, bottom: 0 },
});
