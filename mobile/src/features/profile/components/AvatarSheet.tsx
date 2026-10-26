import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomSheet } from '@/components/layout/BottomSheet';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { showToast, useUiStore } from '@/store/ui';
import { colors, sans } from '@/theme';
import { usePreferences, useProfile, useUpdatePreferences } from '../hooks';
import { Avatar, AVATARS } from './Avatar';

/** "Profile icon" picker. */
export function AvatarSheet() {
  const open = useUiStore((s) => s.avatarOpen);
  const setOpen = useUiStore((s) => s.setAvatarOpen);
  const insets = useSafeAreaInsets();
  const { data: prefs } = usePreferences();
  const { data: profile } = useProfile();
  const update = useUpdatePreferences();
  return (
    <BottomSheet visible={open} onClose={() => setOpen(false)} accessibilityLabel="Profile icon" handle>
      <View style={[styles.body, { paddingBottom: Math.max(34, insets.bottom + 12) }]}>
        <Text accessibilityRole="header" style={[sans(19, 600, 1.2), styles.title]}>
          Profile icon
        </Text>
        <View style={styles.grid}>
          {AVATARS.map((_, i) => {
            const on = (prefs?.avatar ?? 0) === i;
            return (
              <View key={i} style={styles.cell}>
                <Touchable
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`Profile icon ${i + 1}`}
                  onPress={() => {
                    update.mutate({ avatar: i });
                    setOpen(false);
                    showToast('Profile icon updated');
                  }}
                  style={[styles.ring, { borderColor: on ? colors.ink : 'transparent' }]}
                >
                  <Avatar index={i} name={profile?.name ?? ''} size={76} />
                </Touchable>
              </View>
            );
          })}
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 20 },
  title: { marginTop: 12, color: colors.ink },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 16, marginTop: 20 },
  cell: { width: '33.333%', alignItems: 'center' },
  ring: { padding: 3, borderWidth: 2, borderRadius: 999 },
});
