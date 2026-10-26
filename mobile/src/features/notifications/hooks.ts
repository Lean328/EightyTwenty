import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys, useRepositories, type NotificationFeed } from '@/repositories';

export function useNotificationFeed() {
  const repos = useRepositories();
  return useQuery({ queryKey: queryKeys.notifications, queryFn: () => repos.notifications.getFeed(), refetchInterval: 60_000 });
}

type Action = 'markSeen' | 'markAllRead' | 'clearAll';

const optimistic: Record<Action, (f: NotificationFeed) => NotificationFeed> = {
  markSeen: (f) => ({ ...f, unseen: [] }),
  markAllRead: (f) => ({ items: f.items.map((n) => ({ ...n, unread: false })), unseen: [] }),
  clearAll: () => ({ items: [], unseen: [] }),
};

/** Feed actions with optimistic cache updates. */
export function useNotificationAction(action: Action) {
  const repos = useRepositories();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => repos.notifications[action](),
    onMutate: () => {
      const prev = qc.getQueryData<NotificationFeed>(queryKeys.notifications);
      if (prev) qc.setQueryData(queryKeys.notifications, optimistic[action](prev));
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(queryKeys.notifications, ctx.prev),
  });
}
