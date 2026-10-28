import { Redirect } from 'expo-router';
import { config } from '@/constants/config';
import { CheckoutScreen } from '@/features/checkout/screens/CheckoutScreen';

/** In-app ordering is switched off (config.features.ordering) — the cart stays, checkout doesn't. */
export default function CheckoutRoute() {
  return config.features.ordering ? <CheckoutScreen /> : <Redirect href="/cart" />;
}
