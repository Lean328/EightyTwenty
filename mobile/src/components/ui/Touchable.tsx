import { forwardRef, type ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle, type ViewInstance } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface TouchableProps extends Omit<PressableProps, 'style' | 'children'> {
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  /** Opacity while pressed (prototype default `.8`). */
  pressedOpacity?: number;
  /** Scale while pressed (prototype default `.97`; `1` disables). */
  pressedScale?: number;
}

/**
 * Button press feedback from the prototype (`style-active="transform:scale(.97);opacity:.8"`),
 * animated on the UI thread over 150ms.
 */
export const Touchable = forwardRef<ViewInstance, TouchableProps>(function Touchable(
  { style, children, pressedOpacity = 0.8, pressedScale = 0.97, onPressIn, onPressOut, accessibilityRole = 'button', disabled, ...rest },
  ref,
) {
  const pressed = useSharedValue(0);
  const animated = useAnimatedStyle(() => ({
    opacity: 1 - pressed.value * (1 - pressedOpacity),
    transform: [{ scale: 1 - pressed.value * (1 - pressedScale) }],
  }));
  return (
    <AnimatedPressable
      ref={ref}
      accessibilityRole={accessibilityRole}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPressIn={(e) => {
        pressed.value = withTiming(1, { duration: 150 });
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        pressed.value = withTiming(0, { duration: 150 });
        onPressOut?.(e);
      }}
      style={[style, animated]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
});
