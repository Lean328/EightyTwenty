import { assertApiConfigured, config, type DataSource } from '@/constants/config';
import { createApiRepositories } from '@/services/api';
import { createMockRepositories } from '@/services/mock';
import { useSessionStore } from '@/store/session';
import type { RepositoryContext } from './context';
import type { Repositories } from './contracts';

/** Context wired to the session store: the single place repositories learn about auth. */
export const sessionContext: RepositoryContext = {
  getSession: () => useSessionStore.getState().session,
  onSessionRefreshed: (session) => void useSessionStore.getState().update(session),
  onSessionExpired: () => void useSessionStore.getState().signOut({ expired: true }),
};

/**
 * Chooses the data source. Screens never import mock or API code directly — swapping
 * EXPO_PUBLIC_DATA_SOURCE is the only change needed to move to the real backend.
 */
export function createRepositories(source: DataSource = config.dataSource, ctx: RepositoryContext = sessionContext): Repositories {
  if (source === 'api') {
    assertApiConfigured();
    return createApiRepositories(ctx);
  }
  return createMockRepositories(ctx);
}
