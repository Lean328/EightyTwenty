import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Screen } from '@/components/layout/Screen';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { config } from '@/constants/config';
import { useSignOut } from '@/features/auth/hooks';
import { useBottomSpace } from '@/hooks/useBottomSpace';
import { useRepositories } from '@/repositories';
import { errorMessage } from '@/services/errors';
import { biometrics } from '@/services/integrations/biometrics';
import { openUrl } from '@/services/integrations/links';
import { showToast } from '@/store/ui';
import { colors, sans } from '@/theme';
import type { SecuritySettings } from '@/types';
import { confirmAction } from '@/utils/dialog';
import { ChangePasswordSheet } from '../components/ChangePasswordSheet';
import { ToggleGroup, ToggleRow } from '../components/ToggleRow';
import { usePreferences, useUpdatePreferences } from '../hooks';

const ROWS: { key: keyof SecuritySettings; title: string; description: string }[] = [
  { key: 'biometricSignIn', title: 'Sign in with Face ID', description: 'Skip your password on this iPhone' },
  { key: 'useLocation', title: 'Use my location', description: 'Show the nearest café first' },
  { key: 'rememberOrderSettings', title: 'Remember order settings', description: 'Keep your café and pickup method' },
];

/**
 * Privacy & security. "Sign in with Face ID" is this phone's own switch (Face ID unlocks the
 * app when it opens: BiometricLock); the other toggles are stored preferences (location-based
 * sorting is not wired yet). Password change, account deletion and the legal pages use the
 * live API / website.
 */
export function PrivacyScreen() {
  const bottom = useBottomSpace(132);
  const repos = useRepositories();
  const { data: prefs } = usePreferences();
  const update = useUpdatePreferences();
  const signOut = useSignOut();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [faceId, setFaceId] = useState(false);
  useEffect(() => {
    void biometrics.isLockOn().then(setFaceId, () => undefined);
  }, []);

  const toggleFaceId = async (on: boolean) => {
    if (on) {
      if (!(await biometrics.available().catch(() => false))) {
        showToast('Set up Face ID on this iPhone first');
        return;
      }
      if (!(await biometrics.authenticate('Turn on Face ID for EightyTwenty').catch(() => false))) return;
    }
    await biometrics.setLockOn(on);
    setFaceId(on);
    if (prefs) update.mutate({ security: { ...prefs.security, biometricSignIn: on } });
  };

  const closeAccount = async () => {
    const sure = await confirmAction(
      'Close your account?',
      'Your account is deleted straight away: your coffee card stamps, gift card balance, favourites and saved addresses go with it. This can’t be undone.',
      'Close account',
    );
    if (!sure) return;
    try {
      await repos.customer.deleteAccount();
      await signOut();
    } catch (e) {
      showToast(errorMessage(e));
    }
  };

  return (
    <Screen>
      <ScreenHeader title="Privacy & security" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottom }]}>
        {prefs ? (
          <ToggleGroup>
            {ROWS.filter((r) => r.key !== 'useLocation' || config.features.nearestCafe).map((r, i) => (
              <ToggleRow
                key={r.key}
                first={i === 0}
                title={r.title}
                description={r.description}
                value={r.key === 'biometricSignIn' ? faceId : prefs.security[r.key]}
                onChange={(on) => (r.key === 'biometricSignIn' ? void toggleFaceId(on) : update.mutate({ security: { ...prefs.security, [r.key]: on } }))}
              />
            ))}
          </ToggleGroup>
        ) : null}
        <View style={styles.links}>
          <LinkRow label="Change password" onPress={() => setPasswordOpen(true)} />
          <LinkRow label="Privacy policy" onPress={() => void openUrl(`${config.websiteUrl}/privacy`)} />
          <LinkRow label="Terms of use" onPress={() => void openUrl(`${config.websiteUrl}/terms`)} />
          <LinkRow label="Close my account" danger onPress={closeAccount} />
        </View>
      </ScrollView>
      <ChangePasswordSheet visible={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </Screen>
  );
}

function LinkRow({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Touchable onPress={onPress} pressedScale={0.97} style={styles.link}>
      <Text style={[sans(14.5, 600), { color: danger ? colors.danger : colors.ink }]}>{label}</Text>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 8, paddingHorizontal: 20 },
  links: { marginTop: 18 },
  link: { minHeight: 52, justifyContent: 'center' },
});
