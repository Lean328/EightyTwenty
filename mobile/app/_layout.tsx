import { Figtree_400Regular } from '@expo-google-fonts/figtree/400Regular';
import { Figtree_400Regular_Italic } from '@expo-google-fonts/figtree/400Regular_Italic';
import { Figtree_500Medium } from '@expo-google-fonts/figtree/500Medium';
import { Figtree_600SemiBold } from '@expo-google-fonts/figtree/600SemiBold';
import { Figtree_700Bold } from '@expo-google-fonts/figtree/700Bold';
import { Newsreader_300Light } from '@expo-google-fonts/newsreader/300Light';
import { Newsreader_300Light_Italic } from '@expo-google-fonts/newsreader/300Light_Italic';
import { Newsreader_400Regular } from '@expo-google-fonts/newsreader/400Regular';
import { Newsreader_400Regular_Italic } from '@expo-google-fonts/newsreader/400Regular_Italic';
import { Newsreader_500Medium } from '@expo-google-fonts/newsreader/500Medium';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RepositoryProvider } from '@/repositories';
import { isAppError } from '@/services/errors';
import { useSessionStore } from '@/store/session';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => undefined);
SplashScreen.setOptions({ duration: 300, fade: true });

/** Errors that retrying won't fix. */
const NO_RETRY = new Set(['UNAUTHORIZED', 'SESSION_EXPIRED', 'FORBIDDEN', 'NOT_FOUND', 'VALIDATION', 'NOT_IMPLEMENTED']);

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (count, error) => !(isAppError(error) && NO_RETRY.has(error.code)) && count < 2,
      },
      mutations: { retry: false },
    },
  });
}

/**
 * Root layout: fonts, providers and the auth gate.
 * Signed-out users can only reach (auth); signed-in users only (app). Changing the
 * session flips the guards and Expo Router redirects automatically.
 */
export default function RootLayout() {
  const [queryClient] = useState(createQueryClient);
  const status = useSessionStore((s) => s.status);
  const [fontsLoaded, fontError] = useFonts({
    Newsreader_300Light,
    Newsreader_300Light_Italic,
    Newsreader_400Regular,
    Newsreader_400Regular_Italic,
    Newsreader_500Medium,
    Figtree_400Regular,
    Figtree_400Regular_Italic,
    Figtree_500Medium,
    Figtree_600SemiBold,
    Figtree_700Bold,
  });

  useEffect(() => {
    void useSessionStore.getState().restore();
  }, []);

  const ready = (fontsLoaded || !!fontError) && status !== 'restoring';
  useEffect(() => {
    if (ready) SplashScreen.hide();
  }, [ready]);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <RepositoryProvider>
          <Stack screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: colors.cream } }}>
            {/* SDK 58: without redirectTo the guard lands on the bare "/(auth)" group (no index) → not found. */}
            <Stack.Protected guard={status !== 'signedIn'} redirectTo="/">
              <Stack.Screen name="(auth)" />
            </Stack.Protected>
            <Stack.Protected guard={status === 'signedIn'} redirectTo="/welcome">
              <Stack.Screen name="(app)" />
            </Stack.Protected>
          </Stack>
        </RepositoryProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
