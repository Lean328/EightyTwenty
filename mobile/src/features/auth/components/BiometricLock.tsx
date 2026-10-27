import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/Button';
import { TextAction } from '@/components/ui/Links';
import { Text } from '@/components/ui/Text';
import { biometrics } from '@/services/integrations/biometrics';
import { colors, sans } from '@/theme';
import { useSignOut } from '../hooks';
import { Wordmark } from '../screens/WelcomeScreen';

/**
 * Covers the app when it opens until Face ID succeeds, if the customer turned on "Sign in with
 * Face ID" on this phone (Privacy & security). "Use password instead" signs out.
 */
export function BiometricLock() {
  const insets = useSafeAreaInsets();
  const signOut = useSignOut();
  const [state, setState] = useState<'checking' | 'locked' | 'open'>('checking');

  const unlock = useCallback(async () => {
    const ok = await biometrics.authenticate('Unlock EightyTwenty').catch(() => false);
    if (ok) setState('open');
  }, []);

  useEffect(() => {
    let live = true;
    void biometrics
      .isLockOn()
      .catch(() => false)
      .then((on) => {
        if (!live) return;
        setState(on ? 'locked' : 'open');
        if (on) void unlock();
      });
    return () => {
      live = false;
    };
  }, [unlock]);

  if (state === 'open') return null;
  return (
    <View style={[styles.root, { paddingTop: insets.top + 80, paddingBottom: insets.bottom + 24 }]} accessibilityViewIsModal>
      <Wordmark />
      {state === 'locked' ? (
        <View style={styles.actions}>
          <Text style={[sans(15, 400, 1.5), styles.line]}>Unlock with Face ID to see your orders, coffee card and gift cards.</Text>
          <Button label="Unlock with Face ID" onPress={() => void unlock()} height={54} radius={14} fontSize={15} style={styles.stretch} />
          <TextAction label="Use password instead" color={colors.textSecondary} onPress={() => void signOut()} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, zIndex: 100, alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, backgroundColor: colors.creamWarm },
  actions: { alignSelf: 'stretch', gap: 14, alignItems: 'center' },
  stretch: { alignSelf: 'stretch' },
  line: { color: colors.textSecondary, textAlign: 'center', marginBottom: 8 },
});
