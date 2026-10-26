import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { DropIn } from '@/components/layout/Rise';
import { Text } from '@/components/ui/Text';
import { useUiStore } from '@/store/ui';
import { colors, sans, shadows } from '@/theme';

/** Top toast (`role=status`) shown by `showToast()`; sits above sheets. */
export function ToastHost() {
  const toast = useUiStore((s) => s.toast);
  const insets = useSafeAreaInsets();
  if (!toast) return null;
  return (
    <View pointerEvents="none" style={[styles.wrap, { top: insets.top + 6 }]} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <DropIn key={toast.id} style={styles.toast}>
        <View style={styles.tick}>
          <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={colors.ink} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M5 12.5l4.5 4.5L19 7.5" />
          </Svg>
        </View>
        <Text numberOfLines={1} style={[sans(13.5, 500, 1.3), styles.text]}>
          {toast.message}
        </Text>
      </DropIn>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, zIndex: 90 },
  toast: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, backgroundColor: colors.ink, ...shadows.floating },
  tick: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.caramel, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, color: colors.ivory },
});
