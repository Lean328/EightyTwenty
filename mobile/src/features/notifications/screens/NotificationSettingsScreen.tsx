import { ScrollView, StyleSheet } from 'react-native';
import { Screen } from '@/components/layout/Screen';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { ToggleRow, ToggleGroup } from '@/features/profile/components/ToggleRow';
import { usePreferences, useUpdatePreferences } from '@/features/profile/hooks';
import { useBottomSpace } from '@/hooks/useBottomSpace';
import { NOTIFICATION_CATEGORIES } from '../constants';

/**
 * Notification preferences. Stored server-side; push delivery itself is a pending
 * integration (expo-notifications + APNs/FCM) — see docs/BACKEND_HANDOFF.md.
 */
export function NotificationSettingsScreen() {
  const bottom = useBottomSpace(132);
  const { data: prefs } = usePreferences();
  const update = useUpdatePreferences();
  return (
    <Screen>
      <ScreenHeader title="Notifications" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottom }]}>
        {prefs ? (
          <ToggleGroup>
            {NOTIFICATION_CATEGORIES.map((c, i) => (
              <ToggleRow
                key={c.key}
                first={i === 0}
                title={c.key}
                description={c.description}
                value={prefs.notifications[c.key]}
                onChange={(on) => update.mutate({ notifications: { ...prefs.notifications, [c.key]: on } })}
              />
            ))}
          </ToggleGroup>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({ content: { paddingTop: 8, paddingHorizontal: 20 } });
