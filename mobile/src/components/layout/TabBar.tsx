import { memo, useEffect, useState } from 'react';
import { Keyboard, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { TAB_ORDER } from '@/navigation/routeMeta';
import type { TabKey } from '@/store/ui';
import { colors, duration, easing, inkA, sans, shadows } from '@/theme';

const TABS: Record<TabKey, { label: string; icon: IconName }> = {
  home: { label: 'Home', icon: 'home' },
  menu: { label: 'Menu', icon: 'menu' },
  loyalty: { label: 'Loyalty', icon: 'loyalty' },
  profile: { label: 'Profile', icon: 'person' },
};

const BAR_HEIGHT = 58;
const PAD_TOP = 14;
const PAD_X = 14;

/** Height the floating tab bar occupies above the bottom of the screen. */
export function useTabBarHeight(): number {
  const insets = useSafeAreaInsets();
  return PAD_TOP + BAR_HEIGHT + tabBarBottomPadding(insets.bottom);
}

/** The prototype pads 20px under the bar; on devices with a home indicator that sits inside it. */
export function tabBarBottomPadding(bottomInset: number) {
  return Math.max(20, bottomInset - 14);
}

interface TabBarProps {
  active: TabKey;
  visible: boolean;
  onPress: (tab: TabKey) => void;
}

/**
 * Custom bottom navigation from the prototype: ivory pill with a notch cut-out and a dark
 * bubble that glides to the active tab (cubic-bezier(.3,1.18,.4,1), .5s).
 */
export const TabBar = memo(function TabBar({ active, visible, onPress }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [keyboard, setKeyboard] = useState(false);
  const slot = (width - PAD_X * 2) / 4;
  const index = TAB_ORDER.indexOf(active);
  const x = useSharedValue(index * slot);
  const shown = useSharedValue(visible ? 1 : 0);

  useEffect(() => {
    x.value = withTiming(index * slot, { duration: duration.tabBubble, easing: easing.tabBubble });
  }, [index, slot, x]);

  // Android resizes the window for the keyboard — hide the bar instead of floating it above.
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboard(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboard(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const isShown = visible && !keyboard;
  useEffect(() => {
    shown.value = withTiming(isShown ? 1 : 0, { duration: isShown ? 220 : 120 });
  }, [isShown, shown]);

  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const container = useAnimatedStyle(() => ({ opacity: shown.value, transform: [{ translateY: (1 - shown.value) * 24 }] }));

  return (
    <Animated.View
      pointerEvents={isShown ? 'box-none' : 'none'}
      style={[styles.nav, { paddingBottom: tabBarBottomPadding(insets.bottom) }, container]}
      accessibilityRole="tablist"
      aria-hidden={!isShown}
    >
      <View style={styles.bar}>
        <View style={[StyleSheet.absoluteFill, styles.pill]} />
        <View style={[StyleSheet.absoluteFill, styles.clip]} pointerEvents="none">
          <Animated.View style={[styles.notchSlot, { width: slot }, slide]}>
            <Svg width={84} height={40} viewBox="0 0 84 40">
              <Path d="M0 0C10 0 16 4 17.1 13A25 25 0 0 0 66.9 13C68 4 74 0 84 0Z" fill={colors.cream} />
              <Path d="M0 0C10 0 16 4 17.1 13A25 25 0 0 0 66.9 13C68 4 74 0 84 0" fill="none" stroke={inkA(0.1)} strokeWidth={1} />
            </Svg>
          </Animated.View>
        </View>
        <View style={styles.row}>
          {TAB_ORDER.map((key) => (
            <TabButton key={key} tab={key} active={key === active} onPress={onPress} />
          ))}
        </View>
        <Animated.View pointerEvents="none" style={[styles.bubbleSlot, { width: slot }, slide]}>
          <View style={styles.bubble}>
            {TAB_ORDER.map((key) => (
              <BubbleIcon key={key} icon={TABS[key].icon} on={key === active} />
            ))}
          </View>
        </Animated.View>
      </View>
    </Animated.View>
  );
});

function TabButton({ tab, active, onPress }: { tab: TabKey; active: boolean; onPress: (t: TabKey) => void }) {
  const p = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    p.value = withTiming(active ? 1 : 0, { duration: 300, easing: easing.standard });
  }, [active, p]);
  const icon = useAnimatedStyle(() => ({ opacity: 1 - p.value, transform: [{ translateY: p.value * 8 }, { scale: 1 - p.value * 0.4 }] }));
  const color = active ? colors.ink : colors.textMuted;
  return (
    <Touchable
      accessibilityRole="tab"
      accessibilityLabel={TABS[tab].label}
      accessibilityState={{ selected: active }}
      onPress={() => onPress(tab)}
      pressedOpacity={0.75}
      pressedScale={1}
      style={styles.tab}
    >
      <Animated.View style={[styles.tabIcon, icon]}>
        <Icon name={TABS[tab].icon} size={22} strokeWidth={1.6} color={color} />
      </Animated.View>
      <Text style={[sans(11, active ? 600 : 500, undefined, 0.01), { color }]}>{TABS[tab].label}</Text>
    </Touchable>
  );
}

function BubbleIcon({ icon, on }: { icon: IconName; on: boolean }) {
  const o = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    o.value = withTiming(on ? 1 : 0, { duration: 250 });
  }, [on, o]);
  const anim = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.center, anim]}>
      <Icon name={icon} size={20} strokeWidth={1.8} color={colors.creamText} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  nav: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: PAD_TOP, paddingHorizontal: PAD_X, backgroundColor: colors.cream, zIndex: 35 },
  bar: { height: BAR_HEIGHT },
  pill: { borderRadius: 29, backgroundColor: colors.ivory, borderWidth: 1, borderColor: inkA(0.1), ...shadows.tabBar },
  clip: { borderRadius: 29, overflow: 'hidden' },
  notchSlot: { position: 'absolute', top: 0, left: 0, height: 40, alignItems: 'center' },
  row: { ...StyleSheet.absoluteFill, flexDirection: 'row' },
  tab: { flex: 1, height: BAR_HEIGHT, alignItems: 'center', justifyContent: 'flex-end', gap: 5, paddingBottom: 7 },
  tabIcon: { height: 22, alignItems: 'center', justifyContent: 'center' },
  bubbleSlot: { position: 'absolute', top: -10, left: 0, alignItems: 'center' },
  bubble: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.ink, ...shadows.tabBubble },
  center: { alignItems: 'center', justifyContent: 'center' },
});
