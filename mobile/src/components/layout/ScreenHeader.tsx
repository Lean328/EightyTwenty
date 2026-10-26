import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type TextStyle } from 'react-native';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { colors, sans } from '@/theme';

interface ScreenHeaderProps {
  title: string;
  onBack?: () => void;
  right?: ReactNode;
  /** Notifications aligns its title left with an action on the right. */
  align?: 'center' | 'left';
  background?: string;
  color?: string;
  titleStyle?: StyleProp<TextStyle>;
}

/** 48px top bar: back button, title, optional action (the prototype's sticky header). */
export function ScreenHeader({ title, onBack, right, align = 'center', background = colors.cream, color = colors.ink, titleStyle }: ScreenHeaderProps) {
  const back = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')));
  return (
    <View style={[styles.bar, { backgroundColor: background }, align === 'left' && styles.barLeft]}>
      <Touchable onPress={back} accessibilityLabel="Back" style={styles.back} hitSlop={4}>
        <Icon name="back" size={22} strokeWidth={1.8} color={color} />
      </Touchable>
      <Text accessibilityRole="header" numberOfLines={1} style={[sans(16, 600, 1.2), { color }, align === 'center' ? styles.titleCenter : styles.titleLeft, titleStyle]}>
        {title}
      </Text>
      <View style={align === 'center' ? styles.side : styles.right}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { height: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, zIndex: 8 },
  barLeft: { paddingRight: 12 },
  back: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 4 },
  titleCenter: { flex: 1, textAlign: 'center' },
  titleLeft: { flex: 1 },
  side: { width: 48, alignItems: 'flex-end' },
  right: { alignItems: 'flex-end' },
});
