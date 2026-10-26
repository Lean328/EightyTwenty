import { Stack } from 'expo-router';
import { colors } from '@/theme';

/** Signed-out area: the welcome screen with its log in / sign up sheet. */
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.creamWarm } }} />;
}
