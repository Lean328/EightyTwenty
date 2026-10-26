import { router } from 'expo-router';
import { Screen } from '@/components/layout/Screen';
import { EmptyState } from '@/components/ui/Feedback';

/** Unknown deep links land here instead of a blank screen. */
export default function NotFound() {
  return (
    <Screen>
      <EmptyState icon="help" title="Page not found" body="That link doesn’t go anywhere in the app." actionLabel="Go home" actionVariant="primary" onAction={() => router.replace('/')} style={{ flex: 1, justifyContent: 'center' }} />
    </Screen>
  );
}
