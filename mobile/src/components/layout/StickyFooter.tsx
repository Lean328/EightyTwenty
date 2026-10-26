import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, inkA } from '@/theme';

/** Fixed CTA bar (`padding: 12px 20px 30px; border-top`) that respects the home indicator. */
export function StickyFooter({ children, background = colors.cream, style }: { children: ReactNode; background?: string; style?: StyleProp<ViewStyle> }) {
  const insets = useSafeAreaInsets();
  return <View style={[styles.bar, { backgroundColor: background, paddingBottom: Math.max(30, insets.bottom + 12) }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  bar: { paddingTop: 12, paddingHorizontal: 20, borderTopWidth: 1, borderTopColor: inkA(0.08) },
});
