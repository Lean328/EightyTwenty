import type { RepositoryContext } from '@/repositories/context';
import type { Repositories } from '@/repositories/contracts';
import { MockAuthRepository } from './repositories/MockAuthRepository';
import { MockCateringRepository, MockContentRepository, MockLocationRepository, MockMenuRepository } from './repositories/MockCatalogRepositories';
import { MockCustomerRepository, MockPreferencesRepository } from './repositories/MockCustomerRepositories';
import { MockGiftCardRepository, MockLoyaltyRepository, MockNotificationRepository, MockPaymentRepository, MockReservationRepository } from './repositories/MockAccountRepositories';
import { MockOrderRepository } from './repositories/MockOrderRepository';

export { resetMockDatabase } from './db';

/** The local simulated backend. Default data source (EXPO_PUBLIC_DATA_SOURCE=mock). */
export function createMockRepositories(ctx: RepositoryContext): Repositories {
  return {
    auth: new MockAuthRepository(ctx),
    customer: new MockCustomerRepository(ctx),
    preferences: new MockPreferencesRepository(ctx),
    locations: new MockLocationRepository(ctx),
    menu: new MockMenuRepository(ctx),
    orders: new MockOrderRepository(ctx),
    payments: new MockPaymentRepository(ctx),
    loyalty: new MockLoyaltyRepository(ctx),
    reservations: new MockReservationRepository(ctx),
    catering: new MockCateringRepository(ctx),
    giftCards: new MockGiftCardRepository(ctx),
    notifications: new MockNotificationRepository(ctx),
    content: new MockContentRepository(ctx),
  };
}
