import { useRef, useState } from 'react';
import { StyleSheet, View, type TextInputInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomSheet } from '@/components/layout/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { useRepositories } from '@/repositories';
import { errorMessage } from '@/services/errors';
import { useSessionStore } from '@/store/session';
import { showToast } from '@/store/ui';
import { colors, sans } from '@/theme';
import { SIGNUP_PASSWORD_MIN_LENGTH } from '@/utils/validation';

/** Privacy & security → "Change password". The server signs out other sessions and returns a new one. */
export function ChangePasswordSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const repos = useRepositories();
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const nextRef = useRef<TextInputInstance>(null);

  const close = () => {
    setCurrent('');
    setNext('');
    setError('');
    onClose();
  };

  const submit = async () => {
    if (busy) return;
    if (!current) return setError('Enter your current password.');
    if (next.length < SIGNUP_PASSWORD_MIN_LENGTH) return setError(`Your new password needs at least ${SIGNUP_PASSWORD_MIN_LENGTH} characters.`);
    setBusy(true);
    try {
      const session = await repos.auth.changePassword(current, next);
      await useSessionStore.getState().update(session);
      close();
      showToast('Password changed');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={close} accessibilityLabel="Change password" backgroundColor={colors.creamWarm} radius={16} handle duration={280} maxHeight="94%">
      <View style={[styles.body, { paddingBottom: Math.max(30, insets.bottom + 12) }]}>
        <Text accessibilityRole="header" style={[sans(20, 600, 1.2, -0.01), styles.title]}>
          Change password
        </Text>
        <Text style={[sans(13, 400, 1.45), styles.sub]}>You’ll stay signed in on this phone and be signed out everywhere else.</Text>
        <View style={styles.fields}>
          <TextField
            value={current}
            onChangeText={(v) => (setCurrent(v), setError(''))}
            placeholder="Current password"
            accessibilityLabel="Current password"
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="next"
            onSubmitEditing={() => nextRef.current?.focus()}
            height={48}
            radius={10}
            background="#FFF8EE"
          />
          <TextField
            ref={nextRef}
            value={next}
            onChangeText={(v) => (setNext(v), setError(''))}
            placeholder="New password"
            accessibilityLabel="New password"
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="done"
            onSubmitEditing={submit}
            height={48}
            radius={10}
            background="#FFF8EE"
          />
        </View>
        {error ? (
          <Text accessibilityRole="alert" style={[sans(13, 500, 1.4), styles.error]}>
            {error}
          </Text>
        ) : null}
        <Button label="Save password" onPress={submit} loading={busy} height={52} radius={10} weight={500} fontSize={15} style={styles.cta} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 20 },
  title: { marginTop: 16, color: colors.ink },
  sub: { marginTop: 6, color: colors.textAuth },
  fields: { gap: 10, marginTop: 18 },
  error: { marginTop: 10, color: colors.danger },
  cta: { marginTop: 16, width: '100%' },
});
