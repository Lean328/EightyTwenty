import { Stack } from 'expo-router';
import { AppChrome } from '@/navigation/AppChrome';
import { colors } from '@/theme';

/**
 * Signed-in app: ONE native stack (the prototype's single history) with the floating tab
 * bar, mini-cart, sheets and toasts rendered over it by <AppChrome>.
 * The four tab roots live in app/(app)/(tabs)/; tapping a tab resets history to that root.
 * Route behaviour (tab highlight, tab bar, mini-cart) is declared in src/navigation/routeMeta.ts.
 */
export const unstable_settings = { initialRouteName: '(tabs)/index' };

const TAB_ROOT = { animation: 'fade', animationDuration: 200 } as const;

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{ headerShown: false, animation: 'slide_from_right', contentStyle: { backgroundColor: colors.cream } }}
      layout={({ children, state, navigation }) => (
        <AppChrome routeNames={state.routes.map((r) => r.name)} navigation={navigation}>
          {children}
        </AppChrome>
      )}
    >
      <Stack.Screen name="(tabs)/index" options={TAB_ROOT} />
      <Stack.Screen name="(tabs)/menu" options={TAB_ROOT} />
      <Stack.Screen name="(tabs)/loyalty" options={TAB_ROOT} />
      <Stack.Screen name="(tabs)/profile" options={TAB_ROOT} />
      <Stack.Screen name="orders/[id]" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
