import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { AuthSheet } from '@/features/auth/components/AuthSheet';
import type { AuthMode } from '@/features/auth/validation';
import { RepositoryProvider } from '@/repositories';
import { sessionContext } from '@/repositories/createRepositories';
import { createMockRepositories, resetMockDatabase } from '@/services/mock';
import { DEMO_CUSTOMER_ID, DEMO_EMAIL } from '@/services/mock/fixtures/demoCustomer';
import { useSessionStore } from '@/store/session';
import { useUiStore } from '@/store/ui';

function Providers({ children }: { children: ReactNode }) {
  // gcTime Infinity: no 5-minute garbage-collection timers keeping Jest alive after the run.
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
  return (
    <QueryClientProvider client={qc}>
      <RepositoryProvider repositories={createMockRepositories(sessionContext)}>{children}</RepositoryProvider>
    </QueryClientProvider>
  );
}

async function renderSheet(mode: AuthMode) {
  const onModeChange = jest.fn();
  await render(<AuthSheet mode={mode} onModeChange={onModeChange} onClose={jest.fn()} />, { wrapper: Providers });
  return { onModeChange };
}

const press = async (label: string) => fireEvent.press(screen.getByRole('button', { name: label }));
const type = async (label: string, text: string) => fireEvent.changeText(screen.getByLabelText(label), text);

beforeEach(async () => {
  await resetMockDatabase();
  await useSessionStore.getState().signOut();
});

describe('AuthSheet', () => {
  it('validates the login form before calling the backend', async () => {
    await renderSheet('login');
    expect(screen.getByRole('header', { name: 'Welcome back' })).toBeTruthy();

    await press('Log in');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email address.');

    await type('Email', DEMO_EMAIL);
    expect(screen.queryByRole('alert')).toBeNull(); // typing clears the error
    await type('Password', '123');
    await press('Log in');
    expect(screen.getByRole('alert')).toHaveTextContent('Your password needs at least 6 characters.');
    expect(useSessionStore.getState().status).toBe('signedOut');
  });

  it('signs in to the demo account and greets the customer', async () => {
    await renderSheet('login');
    await type('Email', DEMO_EMAIL);
    await type('Password', 'demo-password');
    await press('Log in');

    await waitFor(() => expect(useSessionStore.getState().status).toBe('signedIn'));
    expect(useSessionStore.getState().session?.customerId).toBe(DEMO_CUSTOMER_ID);
    await waitFor(() => expect(useUiStore.getState().toast?.message).toBe('Welcome back, Sophie'));
    // The toast hides itself; let its timer finish so no handle outlives the test.
    await waitFor(() => expect(useUiStore.getState().toast).toBeNull(), { timeout: 4000 });
  });

  it('sign up asks for name and phone and reports an existing email', async () => {
    const { onModeChange } = await renderSheet('signup');
    expect(screen.getByRole('header', { name: 'Create your account' })).toBeTruthy();

    await press('Create account');
    expect(screen.getByRole('alert')).toHaveTextContent('Add your full name.');
    await type('Full name', 'Sophie Nguyen');
    await press('Create account');
    expect(screen.getByRole('alert')).toHaveTextContent('Add a mobile number.');

    await type('Mobile number', '0400 123 456');
    await type('Email', DEMO_EMAIL);
    await type('Password', 'secret1234');
    await press('Create account');
    expect(await screen.findByRole('alert')).toHaveTextContent('An account with this email already exists. Log in instead.');
    expect(useSessionStore.getState().status).toBe('signedOut');

    // "Already have an account? Log in" (the tab shares the label, so take the link below it)
    const loginLinks = screen.getAllByText('Log in');
    await fireEvent.press(loginLinks[loginLinks.length - 1]!);
    expect(onModeChange).toHaveBeenCalledWith('login');
  });
});
