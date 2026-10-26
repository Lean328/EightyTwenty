import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRepositories, type SignInRequest, type SignUpRequest } from '@/repositories';
import { useCartStore } from '@/store/cart';
import { useSessionStore } from '@/store/session';
import { useUiStore } from '@/store/ui';

export function useSignIn() {
  const repos = useRepositories();
  const signIn = useSessionStore((s) => s.signIn);
  return useMutation({
    mutationFn: async (req: SignInRequest) => {
      const session = await repos.auth.signIn(req);
      // Persisting the session flips the route guard from (auth) to (app).
      await signIn(session);
      return session;
    },
  });
}

export function useSignUp() {
  const repos = useRepositories();
  const signIn = useSessionStore((s) => s.signIn);
  return useMutation({
    mutationFn: async (req: SignUpRequest) => {
      const session = await repos.auth.signUp(req);
      await signIn(session);
      return session;
    },
  });
}

/** Signs out: revokes server-side, clears tokens, cached data, cart and transient UI. */
export function useSignOut() {
  const repos = useRepositories();
  const qc = useQueryClient();
  return async () => {
    const session = useSessionStore.getState().session;
    if (session) await repos.auth.signOut(session).catch(() => undefined);
    await useSessionStore.getState().signOut();
    qc.clear();
    useCartStore.getState().reset();
    useUiStore.setState({ item: null, cafePicker: null, orderSettingsOpen: false, walletOpen: false, memberCardOpen: false, avatarOpen: false, newStamps: 0 });
  };
}
