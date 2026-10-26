import { ScrollView, StyleSheet, View } from 'react-native';
import { Screen } from '@/components/layout/Screen';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { useBottomSpace } from '@/hooks/useBottomSpace';
import { useRepositories } from '@/repositories';
import { errorMessage } from '@/services/errors';
import { showToast } from '@/store/ui';
import { colors, sans } from '@/theme';
import type { SecuritySettings } from '@/types';
import { ToggleGroup, ToggleRow } from '../components/ToggleRow';
import { usePreferences, useUpdatePreferences } from '../hooks';

const ROWS: { key: keyof SecuritySettings; title: string; description: string }[] = [
  { key: 'biometricSignIn', title: 'Sign in with Face ID', description: 'Skip your password on this iPhone' },
  { key: 'useLocation', title: 'Use my location', description: 'Show the nearest café first' },
  { key: 'rememberOrderSettings', title: 'Remember order settings', description: 'Keep your café and pickup method' },
];

/**
 * Privacy & security. Toggles are stored preferences; biometric sign-in, location-based
 * sorting, password change and legal pages are pending integrations (see BACKEND_HANDOFF).
 */
export function PrivacyScreen() {
  const bottom = useBottomSpace(132);
  const repos = useRepositories();
  const { data: prefs } = usePreferences();
  const update = useUpdatePreferences();

  const closeAccount = async () => {
    try {
      await repos.customer.requestAccountClosure();
      showToast('Account closure requested');
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
            {ROWS.map((r, i) => (
              <ToggleRow key={r.key} first={i === 0} title={r.title} description={r.description} value={prefs.security[r.key]} onChange={(on) => update.mutate({ security: { ...prefs.security, [r.key]: on } })} />
            ))}
          </ToggleGroup>
        ) : null}
        <View style={styles.links}>
          <LinkRow label="Change password" onPress={() => showToast('Password changes connect with live accounts')} />
          <LinkRow label="Privacy policy" onPress={() => showToast('Opens on eightytwentyfood.com.au')} />
          <LinkRow label="Terms of use" onPress={() => showToast('Opens on eightytwentyfood.com.au')} />
          <LinkRow label="Close my account" danger onPress={closeAccount} />
        </View>
      </ScrollView>
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
