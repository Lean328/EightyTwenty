import { forwardRef } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, type ScrollViewProps, type ScrollViewInstance } from 'react-native';

/**
 * ScrollView for forms: keeps the focused field visible above the keyboard
 * (KeyboardAvoidingView `padding` on iOS; Android resizes the window — Expo guidance)
 * and lets taps on buttons through while the keyboard is open.
 */
export const KeyboardAwareScrollView = forwardRef<ScrollViewInstance, ScrollViewProps>(function KeyboardAwareScrollView({ children, ...rest }, ref) {
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
      <ScrollView
        ref={ref}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        automaticallyAdjustKeyboardInsets={false}
        showsVerticalScrollIndicator={false}
        {...rest}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
});

const styles = StyleSheet.create({ flex: { flex: 1 } });
