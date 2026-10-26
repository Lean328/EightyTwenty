import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BackHandler, KeyboardAvoidingView, PanResponder, Platform, Pressable, StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { colors, duration as durations, easing, inkA } from '@/theme';

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  accessibilityLabel: string;
  children: ReactNode;
  /** e.g. '92%' (item sheet), '84%' (café picker). Omit to size to content. */
  maxHeight?: `${number}%`;
  backgroundColor?: string;
  backdropColor?: string;
  radius?: number;
  /** Draws the 36×4 grabber and enables swipe-down to dismiss. */
  handle?: boolean;
  handleColor?: string;
  /** Slide-up duration (prototype: .32s sheets, .28s auth, .22s calendar). */
  duration?: number;
  panelStyle?: StyleProp<ViewStyle>;
  /** Rendered above the panel content inside the panel (e.g. floating close buttons). */
  overlay?: ReactNode;
}

/**
 * Bottom sheet rendered as an in-window overlay (backdrop fade .22s + sheetUp curve).
 * Hosted at layout level so it covers the floating tab bar, like the prototype.
 * Android back and swipe-down on the grabber dismiss it.
 */
export function BottomSheet({
  visible,
  onClose,
  accessibilityLabel,
  children,
  maxHeight,
  backgroundColor = colors.cream,
  backdropColor = 'rgba(28,24,20,0.42)',
  radius = 20,
  handle = false,
  handleColor = inkA(0.18),
  duration = durations.sheet,
  panelStyle,
  overlay,
}: BottomSheetProps) {
  const { height: screenH } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  // Mount as soon as we become visible (adjusting state during render, per React docs);
  // unmount happens after the exit animation.
  if (visible && !mounted) setMounted(true);
  const progress = useSharedValue(0);
  const backdrop = useSharedValue(0);
  const drag = useSharedValue(0);
  const panelH = useSharedValue(screenH);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (visible) {
      drag.set(0);
      progress.set(withTiming(1, { duration, easing: easing.sheet }));
      backdrop.set(withTiming(1, { duration: durations.backdrop, easing: Easing.ease }));
    } else {
      backdrop.set(withTiming(0, { duration: 200 }));
      progress.set(
        withTiming(0, { duration: 220, easing: Easing.in(Easing.quad) }, (done) => {
          if (done) runOnJS(setMounted)(false);
        }),
      );
    }
  }, [visible, duration, drag, progress, backdrop]);

  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onCloseRef.current();
      return true;
    });
    return () => sub.remove();
  }, [visible]);

  // Swipe down on the grabber to dismiss. (Drags only touch shared values, so the
  // responder is never recreated mid-gesture.)
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderMove: (_, g) => drag.set(Math.max(0, g.dy)),
        onPanResponderRelease: (_, g) => {
          if (g.dy > 90 || g.vy > 1.1) onClose();
          else drag.set(withTiming(0, { duration: 180, easing: easing.standard }));
        },
        onPanResponderTerminate: () => drag.set(withTiming(0, { duration: 180 })),
      }),
    [drag, onClose],
  );

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));
  const panelAnim = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - progress.value) * (panelH.value + 40) + drag.value }] }));

  if (!mounted) return null;

  return (
    // z-index 80 like the prototype's sheets: above the tab bar (35) and sticky bars, below toasts (90).
    <View style={[StyleSheet.absoluteFill, styles.layer]} pointerEvents={visible ? 'auto' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: backdropColor }, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
      </Animated.View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.kav} pointerEvents="box-none">
        <Animated.View
          accessibilityViewIsModal
          accessibilityLabel={accessibilityLabel}
          onLayout={(e) => panelH.set(e.nativeEvent.layout.height)}
          style={[
            styles.panel,
            { backgroundColor, borderTopLeftRadius: radius, borderTopRightRadius: radius, maxHeight: maxHeight ?? '92%' },
            panelStyle,
            panelAnim,
          ]}
        >
          {handle ? (
            <View {...pan.panHandlers} style={styles.handleZone}>
              <View style={[styles.handle, { backgroundColor: handleColor }]} />
            </View>
          ) : null}
          {children}
          {overlay}
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { zIndex: 80 },
  kav: { flex: 1, justifyContent: 'flex-end' },
  panel: { overflow: 'hidden' },
  handleZone: { paddingTop: 10, paddingBottom: 2, alignItems: 'center' },
  handle: { width: 36, height: 4, borderRadius: 2 },
});
