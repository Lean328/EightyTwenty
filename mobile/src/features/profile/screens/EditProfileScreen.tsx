import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { KeyboardAwareScrollView } from '@/components/layout/KeyboardAwareScrollView';
import { Screen } from '@/components/layout/Screen';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { StickyFooter } from '@/components/layout/StickyFooter';
import { Button } from '@/components/ui/Button';
import { TextAction } from '@/components/ui/Links';
import { Text } from '@/components/ui/Text';
import { Field, TextField } from '@/components/ui/TextField';
import { Touchable } from '@/components/ui/Touchable';
import { errorMessage } from '@/services/errors';
import { showToast, useUiStore } from '@/store/ui';
import { colors, sans } from '@/theme';
import { isEmail } from '@/utils/validation';
import { Avatar } from '../components/Avatar';
import { usePreferences, useProfile, useUpdateProfile } from '../hooks';

export function EditProfileScreen() {
  const { data: profile } = useProfile();
  const { data: prefs } = usePreferences();
  const update = useUpdateProfile();
  const setAvatarOpen = useUiStore((s) => s.setAvatarOpen);
  // Unsaved edits layered over the stored profile.
  const [edits, setEdits] = useState<Partial<Record<'name' | 'email' | 'phone', string>>>({});
  const [error, setError] = useState('');
  const form = { name: edits.name ?? profile?.name ?? '', email: edits.email ?? profile?.email ?? '', phone: edits.phone ?? profile?.phone ?? '' };

  const set = (key: keyof typeof form) => (value: string) => {
    setEdits((f) => ({ ...f, [key]: value }));
    setError('');
  };

  const save = async () => {
    if (!form.name.trim()) return setError('Add your name.');
    if (!isEmail(form.email)) return setError('Enter a valid email address.');
    try {
      await update.mutateAsync({ name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim() });
      router.back();
      showToast('Profile saved');
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Screen>
      <ScreenHeader title="Edit profile" />
      <KeyboardAwareScrollView contentContainerStyle={styles.content}>
        <View style={styles.avatar}>
          <Touchable onPress={() => setAvatarOpen(true)} accessibilityLabel="Change profile icon">
            <Avatar index={prefs?.avatar ?? 0} name={form.name} size={88} />
          </Touchable>
          <TextAction label="Change icon" onPress={() => setAvatarOpen(true)} />
        </View>
        <View style={styles.fields}>
          <Field label="Full name" gap={8} tone="ink">
            <TextField value={form.name} onChangeText={set('name')} autoComplete="name" accessibilityLabel="Full name" height={50} radius={12} />
          </Field>
          <Field label="Email" gap={8} tone="ink">
            <TextField value={form.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" autoComplete="email" accessibilityLabel="Email" height={50} radius={12} />
          </Field>
          <Field label="Mobile" gap={8} tone="ink">
            <TextField value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" autoComplete="tel" accessibilityLabel="Mobile" height={50} radius={12} />
          </Field>
          <Text style={[sans(12, 400, 1.45), { color: colors.textMuted }]}>Used for your orders, bookings and receipts.</Text>
        </View>
      </KeyboardAwareScrollView>
      <StickyFooter>
        {error ? (
          <Text accessibilityRole="alert" style={[sans(13, 500, 1.4), styles.error]}>
            {error}
          </Text>
        ) : null}
        <Button label="Save changes" onPress={save} loading={update.isPending} height={56} radius={14} fontSize={15} />
      </StickyFooter>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 20 },
  avatar: { alignItems: 'center', gap: 10, paddingTop: 14, paddingHorizontal: 20 },
  fields: { gap: 14, paddingTop: 18, paddingHorizontal: 20 },
  error: { marginBottom: 10, color: colors.danger },
});
