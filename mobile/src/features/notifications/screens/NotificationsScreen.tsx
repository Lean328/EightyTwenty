import { router } from 'expo-router';
import { useEffect } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Screen } from '@/components/layout/Screen';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { TextAction } from '@/components/ui/Links';
import { Text } from '@/components/ui/Text';
import { useBottomSpace } from '@/hooks/useBottomSpace';
import { useNow } from '@/hooks/useNow';
import { errorMessage } from '@/services/errors';
import { colors, inkA, sans } from '@/theme';
import { formatRelativeShort } from '@/utils/datetime';
import { KIND_ICON } from '../constants';
import { useNotificationAction, useNotificationFeed } from '../hooks';

export function NotificationsScreen() {
  const now = useNow();
  const bottom = useBottomSpace(132);
  const feed = useNotificationFeed();
  const markSeen = useNotificationAction('markSeen');
  const markAllRead = useNotificationAction('markAllRead');
  const clearAll = useNotificationAction('clearAll');
  const items = feed.data?.items ?? [];

  // Opening the feed clears the bell badge (unread dots stay until "Mark all read").
  useEffect(() => {
    markSeen.mutate();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Screen>
      <ScreenHeader title="Notifications" align="left" right={items.length ? <TextAction label="Mark all read" onPress={() => markAllRead.mutate()} /> : null} />
      {feed.isLoading ? (
        <View style={styles.list}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} delay={i * 100} style={styles.skel} />
          ))}
        </View>
      ) : feed.isError ? (
        <ErrorState message={errorMessage(feed.error)} onRetry={feed.refetch} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => n.id}
          contentContainerStyle={[styles.list, { paddingBottom: bottom }]}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderItem={({ item: n }) => (
            <View style={styles.card} accessible accessibilityLabel={`${n.unread ? 'Unread. ' : ''}${n.kind}. ${n.text}. ${formatRelativeShort(n.createdAt, now)}`}>
              <View style={styles.icon}>
                <Icon name={KIND_ICON[n.kind]} size={19} strokeWidth={1.7} />
              </View>
              <View style={styles.text}>
                <Text style={[sans(13, 600, 1.2), { color: colors.ink }]}>{n.kind}</Text>
                <Text style={[sans(14, 400, 1.45), styles.body]}>{n.text}</Text>
                <Text style={[sans(12), styles.when]}>{formatRelativeShort(n.createdAt, now)}</Text>
              </View>
              {n.unread ? <View style={styles.dot} /> : null}
            </View>
          )}
          ListFooterComponent={
            items.length ? (
              <View style={styles.footer}>
                <TextAction label="Notification settings" onPress={() => router.push('/notifications/settings')} />
                <TextAction label="Clear all" weight={500} color={colors.textSecondary} onPress={() => clearAll.mutate()} />
              </View>
            ) : undefined
          }
          ListEmptyComponent={
            <EmptyState icon="bell" title="You're all caught up" body="Order updates, stamps and booking news will land here." actionLabel="Notification settings" onAction={() => router.push('/notifications/settings')} />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingTop: 8, paddingHorizontal: 20 },
  skel: { height: 92, borderRadius: 14, marginBottom: 8 },
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, borderRadius: 14, backgroundColor: colors.ivory, borderWidth: 1, borderColor: inkA(0.07) },
  icon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.linen, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, minWidth: 0 },
  body: { marginTop: 4, color: colors.ink },
  when: { marginTop: 6, color: colors.textMuted },
  dot: { width: 8, height: 8, marginTop: 4, borderRadius: 4, backgroundColor: colors.caramel },
  footer: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 16 },
});
