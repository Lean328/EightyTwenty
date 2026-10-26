import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/theme';

// Replaces the prototype's CSS feTurbulence grain (rgb(64,43,31) at ≤5.5% alpha) with a tiling PNG.
const GRAIN = require('../../../assets/images/textures/grain.webp');

interface ScreenProps {
  children: ReactNode;
  background?: string;
  /**
   * Status-bar area. `shield` keeps an opaque band (the prototype's 50px "shield") so
   * content never scrolls under the clock; `none` lets content (e.g. a hero photo) go edge to edge.
   */
  top?: 'shield' | 'none';
  shieldColor?: string;
  statusBar?: 'dark' | 'light';
  /** Paper grain texture — on by default for the cream app background. */
  grain?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Screen({ children, background = colors.cream, top = 'shield', shieldColor, statusBar = 'dark', grain, style }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const showGrain = grain ?? background === colors.cream;
  return (
    <View style={[styles.root, { backgroundColor: background }, style]}>
      <StatusBar style={statusBar} />
      {showGrain ? <Image source={GRAIN} resizeMode="repeat" style={styles.grain} accessibilityIgnoresInvertColors /> : null}
      {top === 'shield' ? <View style={{ height: insets.top, backgroundColor: shieldColor ?? background, zIndex: 30 }} /> : null}
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  grain: { ...StyleSheet.absoluteFill, width: '100%', height: '100%' },
  body: { flex: 1 },
});
