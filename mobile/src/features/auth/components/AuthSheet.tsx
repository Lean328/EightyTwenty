import { useQueryClient } from '@tanstack/react-query';
import { forwardRef, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { BottomSheet } from '@/components/layout/BottomSheet';
import { Button } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Text } from '@/components/ui/Text';
import { TextField, type TextFieldProps } from '@/components/ui/TextField';
import { Touchable } from '@/components/ui/Touchable';
import { config } from '@/constants/config';
import { queryKeys, useRepositories } from '@/repositories';
import { errorMessage } from '@/services/errors';
import { showToast } from '@/store/ui';
import { colors, inkA, sans } from '@/theme';
import { firstNameOf } from '@/utils/format';
import { useSignIn, useSignUp } from '../hooks';
import { validateAuthForm, type AuthForm, type AuthMode } from '../validation';

const EMPTY: AuthForm = { name: '', phone: '', email: '', password: '' };

/** Log in / Sign up sheet over the welcome hero. */
export function AuthSheet({ mode, onModeChange, onClose }: { mode: AuthMode | null; onModeChange: (m: AuthMode) => void; onClose: () => void }) {
  const [form, setForm] = useState<AuthForm>(EMPTY);
  const [error, setError] = useState('');
  const signIn = useSignIn();
  const signUp = useSignUp();
  const repos = useRepositories();
  const qc = useQueryClient();
  const busy = signIn.isPending || signUp.isPending;
  const signup = mode === 'signup';
  const phoneRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const switchMode = (m: AuthMode) => {
    setError('');
    onModeChange(m);
  };

  const set = (key: keyof AuthForm) => (value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setError('');
  };

  const submit = async () => {
    if (!mode || busy) return;
    const err = validateAuthForm(mode, form);
    if (err) return setError(err);
    try {
      if (signup) await signUp.mutateAsync({ name: form.name.trim(), phone: form.phone, email: form.email.trim(), password: form.password });
      else await signIn.mutateAsync({ email: form.email.trim(), password: form.password });
      const profile = await repos.customer.getProfile();
      qc.setQueryData(queryKeys.profile, profile);
      showToast(signup ? `Welcome to EightyTwenty, ${firstNameOf(form.name)}` : `Welcome back, ${firstNameOf(profile.name)}`);
      setForm(EMPTY);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const forgot = async () => {
    try {
      await repos.auth.requestPasswordReset(form.email);
      showToast('Check your email for a reset link');
    } catch (e) {
      showToast(errorMessage(e));
    }
  };

  return (
    <BottomSheet
      visible={!!mode}
      onClose={onClose}
      accessibilityLabel={signup ? 'Create your account' : 'Welcome back'}
      backgroundColor={colors.creamWarm}
      backdropColor="rgba(28,24,20,0.3)"
      radius={16}
      handle
      duration={280}
      maxHeight="94%"
    >
      <View style={styles.body}>
        <SegmentedControl
          tone="ink"
          value={mode ?? 'login'}
          onChange={switchMode}
          segments={[
            { value: 'login', label: 'Log in' },
            { value: 'signup', label: 'Sign up' },
          ]}
          style={styles.tabs}
        />
        <Text accessibilityRole="header" style={[sans(20, 600, 1.2, -0.01), styles.title]}>
          {signup ? 'Create your account' : 'Welcome back'}
        </Text>
        <Text style={[sans(13, 400, 1.45), styles.sub]}>
          {signup ? 'Order ahead, book a table and collect coffee stamps at every EightyTwenty.' : 'Log in to order ahead and see your coffee card.'}
        </Text>
        <View style={styles.fields}>
          {signup ? (
            <>
              <AuthInput value={form.name} onChangeText={set('name')} placeholder="Full name" accessibilityLabel="Full name" autoComplete="name" textContentType="name" returnKeyType="next" onSubmitEditing={() => phoneRef.current?.focus()} />
              <AuthInput ref={phoneRef} value={form.phone} onChangeText={set('phone')} placeholder="Mobile number" accessibilityLabel="Mobile number" keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" returnKeyType="next" onSubmitEditing={() => emailRef.current?.focus()} />
            </>
          ) : null}
          <AuthInput ref={emailRef} value={form.email} onChangeText={set('email')} placeholder="Email" accessibilityLabel="Email" keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" returnKeyType="next" onSubmitEditing={() => passwordRef.current?.focus()} />
          <AuthInput
            ref={passwordRef}
            value={form.password}
            onChangeText={set('password')}
            placeholder="Password"
            accessibilityLabel="Password"
            secureTextEntry
            autoComplete={signup ? 'new-password' : 'current-password'}
            textContentType={signup ? 'newPassword' : 'password'}
            returnKeyType="go"
            onSubmitEditing={submit}
          />
        </View>
        {error ? (
          <Text accessibilityRole="alert" style={[sans(13, 500, 1.4), styles.error]}>
            {error}
          </Text>
        ) : null}
        <Button label={signup ? 'Create account' : 'Log in'} onPress={submit} loading={busy} height={52} radius={10} weight={500} fontSize={15} style={styles.cta} />
        {signup ? (
          <>
            <Text style={[sans(11, 400, 1.4), styles.fine]}>By creating an account you agree to our Terms and Privacy Policy.</Text>
            <View style={styles.switchRow}>
              <Text style={[sans(13, 400, 1.4), { color: colors.textAuth }]}>Already have an account? </Text>
              <Touchable onPress={() => switchMode('login')} hitSlop={8} pressedScale={1}>
                <Text style={[sans(13, 500), styles.link]}>Log in</Text>
              </Touchable>
            </View>
          </>
        ) : (
          <Touchable onPress={forgot} style={styles.forgot} hitSlop={8} pressedScale={1}>
            <Text style={[sans(13), styles.forgotText]}>Forgot password?</Text>
          </Touchable>
        )}
        {config.dataSource === 'mock' ? (
          <Text style={[sans(11, 400, 1.4), styles.fine]}>Preview only — account access isn’t connected to a live service yet.</Text>
        ) : null}
      </View>
    </BottomSheet>
  );
}

/** Auth fields: 48pt, warm white fill (#FFF8EE) on the cream sheet. */
const AuthInput = forwardRef<TextInput, TextFieldProps>(function AuthInput(props, ref) {
  return <TextField ref={ref} height={48} radius={10} background="#FFF8EE" {...props} />;
});

const styles = StyleSheet.create({
  body: { paddingHorizontal: 20, paddingBottom: 30 },
  tabs: { marginTop: 16 },
  title: { marginTop: 20, color: colors.ink },
  sub: { marginTop: 6, color: colors.textAuth },
  fields: { gap: 10, marginTop: 18 },
  error: { marginTop: 10, color: colors.danger },
  cta: { marginTop: 16, width: '100%' },
  fine: { marginTop: 12, textAlign: 'center', color: colors.textWarmMuted },
  switchRow: { marginTop: 8, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  link: { color: colors.ink, textDecorationLine: 'underline' },
  forgot: { alignSelf: 'center', marginTop: 14, paddingVertical: 4 },
  forgotText: { color: colors.textAuth, textDecorationLine: 'underline', textDecorationColor: inkA(0.4) },
});
