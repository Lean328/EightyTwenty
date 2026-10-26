import { create } from 'zustand';
import { secureStorage } from '@/services/integrations/secureStorage';
import type { Session } from '@/types';

/**
 * Authentication session. Tokens persist in the device keychain/keystore
 * (secureStorage); the rest of the app reads `status` to decide which routes are reachable.
 */
const STORAGE_KEY = 'eightytwenty.session';

export type SessionStatus = 'restoring' | 'signedOut' | 'signedIn';

interface SessionState {
  status: SessionStatus;
  session: Session | null;
  /** Set when the server rejected the session; the welcome screen shows a notice. */
  expired: boolean;
  restore(): Promise<void>;
  signIn(session: Session): Promise<void>;
  /** Replace tokens after a refresh without changing status. */
  update(session: Session): Promise<void>;
  signOut(options?: { expired?: boolean }): Promise<void>;
}

export const useSessionStore = create<SessionState>((set) => ({
  status: 'restoring',
  session: null,
  expired: false,

  async restore() {
    try {
      const raw = await secureStorage.get(STORAGE_KEY);
      const session = raw ? (JSON.parse(raw) as Session) : null;
      const valid = session && (!session.expiresAt || new Date(session.expiresAt).getTime() > Date.now() || !!session.refreshToken);
      set({ session: valid ? session : null, status: valid ? 'signedIn' : 'signedOut' });
    } catch {
      set({ session: null, status: 'signedOut' });
    }
  },

  async signIn(session) {
    await secureStorage.set(STORAGE_KEY, JSON.stringify(session));
    set({ session, status: 'signedIn', expired: false });
  },

  async update(session) {
    await secureStorage.set(STORAGE_KEY, JSON.stringify(session));
    set({ session });
  },

  async signOut(options) {
    await secureStorage.remove(STORAGE_KEY).catch(() => undefined);
    set({ session: null, status: 'signedOut', expired: !!options?.expired });
  },
}));

/** Non-React accessor used by repositories and the HTTP client. */
export const getSession = () => useSessionStore.getState().session;
