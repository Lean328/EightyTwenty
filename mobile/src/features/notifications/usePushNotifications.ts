import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { queryKeys, useRepositories } from '@/repositories';
import { getPushToken, onPushReceived, onPushTap, pushToken, type PushData } from '@/services/integrations/push';
import { useSessionStore } from '@/store/session';
import { screenForPush, STALE_FOR_KIND } from './pushRoutes';

/**
 * Signed-in only: registers this phone for push once per sign-in, refreshes the data a push
 * touches, and opens the matching screen when a push is tapped.
 */
export function usePushNotifications() {
  const repos = useRepositories();
  const qc = useQueryClient();
  const customerId = useSessionStore((s) => s.session?.customerId);

  useEffect(() => {
    if (!customerId) return;
    let cancelled = false;
    void (async () => {
      const token = await getPushToken();
      if (!token || cancelled) return;
      try {
        await repos.notifications.registerPushToken(token, Platform.OS === 'ios' ? 'ios' : 'android');
        pushToken.set(token);
      } catch {
        // Not fatal: the in-app feed still shows everything; the next launch retries.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customerId, repos]);

  useEffect(() => {
    const refresh = (data: PushData) => {
      void qc.invalidateQueries({ queryKey: queryKeys.notifications });
      for (const key of STALE_FOR_KIND[data.kind ?? ''] ?? []) void qc.invalidateQueries({ queryKey: key });
    };
    const offReceived = onPushReceived(refresh);
    const offTap = onPushTap((data) => {
      refresh(data);
      router.push(screenForPush(data));
    });
    return () => {
      offReceived();
      offTap();
    };
  }, [qc]);
}
