/**
 * Renders every screen (and the global sheets) as a signed-in customer on the native code
 * path (jest-expo runs as iOS) with the mock backend, and fails on any thrown error or
 * console.error — the cheap way to catch a screen that would show a red box or crash on a
 * phone before anyone taps through it.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react-native';
import type { ComponentType, ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { WelcomeScreen } from '@/features/auth/screens/WelcomeScreen';
import { CartScreen } from '@/features/cart/screens/CartScreen';
import { CateringScreen } from '@/features/catering/screens/CateringScreen';
import { CheckoutScreen } from '@/features/checkout/screens/CheckoutScreen';
import { GiftCardsScreen } from '@/features/gift-cards/screens/GiftCardsScreen';
import { HomeScreen } from '@/features/home/screens/HomeScreen';
import { OffersScreen } from '@/features/home/screens/OffersScreen';
import { CafeDetailScreen } from '@/features/locations/screens/CafeDetailScreen';
import { CafesScreen } from '@/features/locations/screens/CafesScreen';
import { LoyaltyScreen } from '@/features/loyalty/screens/LoyaltyScreen';
import { MenuScreen } from '@/features/menu/screens/MenuScreen';
import { NotificationSettingsScreen } from '@/features/notifications/screens/NotificationSettingsScreen';
import { NotificationsScreen } from '@/features/notifications/screens/NotificationsScreen';
import { OrderStatusScreen } from '@/features/orders/screens/OrderStatusScreen';
import { ActivityScreen } from '@/features/profile/screens/ActivityScreen';
import { EditProfileScreen } from '@/features/profile/screens/EditProfileScreen';
import { FavouritesScreen } from '@/features/profile/screens/FavouritesScreen';
import { HelpScreen } from '@/features/profile/screens/HelpScreen';
import { PaymentMethodsScreen } from '@/features/profile/screens/PaymentMethodsScreen';
import { PreferencesScreen } from '@/features/profile/screens/PreferencesScreen';
import { PrivacyScreen } from '@/features/profile/screens/PrivacyScreen';
import { ProfileScreen } from '@/features/profile/screens/ProfileScreen';
import { ReserveScreen } from '@/features/reservations/screens/ReserveScreen';
import { AppChrome } from '@/navigation/AppChrome';
import { RepositoryProvider, type Repositories } from '@/repositories';
import { sessionContext } from '@/repositories/createRepositories';
import { createMockRepositories, resetMockDatabase } from '@/services/mock';
import { DEMO_EMAIL } from '@/services/mock/fixtures/demoCustomer';
import { useCartStore } from '@/store/cart';
import { useSessionStore } from '@/store/session';
import { useUiStore } from '@/store/ui';

const params: Record<string, string> = {};
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return {
    router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), dismissAll: jest.fn(), canGoBack: () => true, navigate: jest.fn() },
    useLocalSearchParams: () => params,
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
    useIsFocused: () => true,
    Link: ({ children }: { children: ReactNode }) => children,
  };
});

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
let repos: Repositories;

function Providers({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={qc}>
        <RepositoryProvider repositories={repos}>{children}</RepositoryProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

/** Render, then let the mock queries settle (latency is 0 in tests). */
async function show(Screen: ComponentType) {
  const view = await render(<Screen />, { wrapper: Providers });
  await act(async () => {
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
  });
  return view;
}

let errors: string[];
beforeEach(async () => {
  await resetMockDatabase();
  repos = createMockRepositories(sessionContext);
  await useSessionStore.getState().signIn(await repos.auth.signIn({ email: DEMO_EMAIL, password: 'demo-password' }));
  useCartStore.getState().reset();
  useUiStore.setState({ item: null, cafePicker: null, orderSettingsOpen: false, walletOpen: false, memberCardOpen: false, avatarOpen: false });
  for (const key of Object.keys(params)) delete params[key];
  errors = [];
  jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => void errors.push(args.map(String).join(' ').slice(0, 400)));
});
afterEach(() => {
  jest.restoreAllMocks();
  expect(errors).toEqual([]);
});

const SCREENS: [string, ComponentType, string][] = [
  ['Home', HomeScreen, 'Our cafés'],
  ['Menu', MenuScreen, 'Menu'],
  ['Loyalty', LoyaltyScreen, 'coffees to go'],
  ['Profile', ProfileScreen, 'Order history'],
  ['Cafés', CafesScreen, 'Our cafés'],
  ['Offers', OffersScreen, 'Your 10th coffee is free.'],
  ['Notifications', NotificationsScreen, 'Notifications'],
  ['Notification settings', NotificationSettingsScreen, 'Order updates'],
  ['Cart (empty)', CartScreen, 'Your order is empty'],
  ['Reserve', ReserveScreen, 'Request a table'],
  ['Catering', CateringScreen, 'Catering'],
  ['Edit profile', EditProfileScreen, 'Save changes'],
  ['Favourites', FavouritesScreen, 'Favourites'],
  ['Gift cards', GiftCardsScreen, 'Send a gift card'],
  ['Payment methods', PaymentMethodsScreen, 'Add a card'],
  ['Preferences', PreferencesScreen, 'Saved addresses'],
  ['Privacy', PrivacyScreen, 'Close my account'],
  ['Help', HelpScreen, 'Get in touch'],
];

describe('every screen renders on the native code path', () => {
  it.each(SCREENS)('%s', async (_name, Screen, text) => {
    await show(Screen);
    expect(screen.getAllByText(text, { exact: false }).length).toBeGreaterThan(0);
  });

  it('Welcome (signed out)', async () => {
    await useSessionStore.getState().signOut();
    await show(WelcomeScreen);
    expect(screen.getByText('Log in')).toBeTruthy();
  });

  it('Café detail', async () => {
    params.id = 'braddon';
    await show(CafeDetailScreen);
    expect(screen.getAllByText('Braddon').length).toBeGreaterThan(0);
  });

  it.each(['orders', 'reservations', 'catering'])('Activity · %s', async (segment) => {
    params.segment = segment;
    await show(ActivityScreen);
    expect(screen.getByText('Activity')).toBeTruthy();
  });

  it('Order status', async () => {
    const order = (await repos.orders.getOrderHistory()).items[0]!;
    params.id = order.id;
    await show(OrderStatusScreen);
    expect(screen.getByText(order.number)).toBeTruthy();
  });

  it('Cart and checkout with items', async () => {
    const items = await repos.menu.getMenuItems('phillip');
    const plain = items.find((i) => !i.modifierGroups.some((g) => g.required))!;
    useCartStore.getState().addItem(plain, {}, 2, '');
    await show(CartScreen);
    expect(screen.getByText(plain.name)).toBeTruthy();
    await show(CheckoutScreen);
    expect(screen.getAllByText('Checkout', { exact: false }).length).toBeGreaterThan(0);
  });

  it('Menu inside the app chrome, with every global sheet open', async () => {
    const items = await repos.menu.getMenuItems('phillip');
    const withOptions = items.find((i) => i.modifierGroups.some((g) => g.required)) ?? items[0]!;
    const Chrome = () => (
      <AppChrome state={{ routes: [{ name: '(tabs)/menu' }] }} navigation={{ reset: jest.fn() }}>
        <MenuScreen />
      </AppChrome>
    );
    await show(Chrome);
    for (const open of [
      () => useUiStore.getState().openItem(withOptions),
      () => useUiStore.getState().openCafePicker(),
      () => useUiStore.getState().setOrderSettingsOpen(true),
      () => useUiStore.getState().setWalletOpen(true),
      () => useUiStore.getState().setMemberCardOpen(true),
      () => useUiStore.getState().setAvatarOpen(true),
    ]) {
      await act(async () => {
        open();
        await new Promise((r) => setTimeout(r, 0));
      });
    }
    expect(screen.getAllByText(withOptions.name).length).toBeGreaterThan(0);
  });
});
