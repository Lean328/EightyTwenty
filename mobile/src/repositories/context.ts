import type { Session } from '@/types';

/**
 * What repositories need from the app shell. Implemented by the session store
 * (src/store/session.ts) and injected in createRepositories().
 */
export interface RepositoryContext {
  /** Current session, or null when signed out. */
  getSession(): Session | null;
  /** Called by the HTTP client after a successful token refresh. */
  onSessionRefreshed(session: Session): void;
  /** Called when the session can no longer be refreshed (expired/revoked). */
  onSessionExpired(): void;
}
