import { config } from '@/constants/config';
import type { RepositoryContext } from '@/repositories/context';
import type { Repositories } from '@/repositories/contracts';
import { HttpClient } from './client';
import * as R from './repositories';

/** HTTP data source (EXPO_PUBLIC_DATA_SOURCE=api). */
export function createApiRepositories(ctx: RepositoryContext): Repositories {
  let auth: R.HttpAuthRepository;
  const http = new HttpClient({
    baseUrl: config.api.baseUrl,
    timeoutMs: config.api.timeoutMs,
    ctx,
    refreshSession: (token) => auth.refresh(token),
  });
  auth = new R.HttpAuthRepository(http);
  return {
    auth,
    customer: new R.HttpCustomerRepository(http),
    preferences: new R.HttpPreferencesRepository(http),
    locations: new R.HttpLocationRepository(http),
    menu: new R.HttpMenuRepository(http),
    orders: new R.HttpOrderRepository(http),
    payments: new R.HttpPaymentRepository(http),
    loyalty: new R.HttpLoyaltyRepository(http),
    reservations: new R.HttpReservationRepository(http),
    catering: new R.HttpCateringRepository(http),
    giftCards: new R.HttpGiftCardRepository(http),
    notifications: new R.HttpNotificationRepository(http),
    content: new R.HttpContentRepository(http),
  };
}
