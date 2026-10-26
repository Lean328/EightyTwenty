import AsyncStorage from '@react-native-async-storage/async-storage';
import { config } from '@/constants/config';
import { AppError } from '@/services/errors';
import type { ID } from '@/types';
import { createDemoCustomer, DEMO_CUSTOMER_ID, DEMO_EMAIL } from './fixtures/demoCustomer';
import type { MockCustomerRecord, MockDbState } from './types';

/**
 * The simulated backend's database.
 *
 * - Seeded with the demo account from the design export.
 * - Mutations are written to AsyncStorage (debounced) when EXPO_PUBLIC_MOCK_PERSIST=true,
 *   so a demo stays consistent across restarts. This is device-local demo storage —
 *   it is NOT a backend and holds no real customer data.
 * - `resetMockDatabase()` restores the seed (also exposed for tests).
 */
const STORAGE_KEY = 'eightytwenty.mockdb';
const DB_VERSION = 3;

function seed(): MockDbState {
  return {
    version: DB_VERSION,
    customers: { [DEMO_CUSTOMER_ID]: createDemoCustomer() },
    emailIndex: { [DEMO_EMAIL]: DEMO_CUSTOMER_ID },
  };
}

class MockDatabase {
  private state: MockDbState | null = null;
  private loading: Promise<MockDbState> | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  private async load(): Promise<MockDbState> {
    if (config.mock.persist) {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as MockDbState;
          if (parsed.version === DB_VERSION) return parsed;
        }
      } catch (e) {
        console.warn('[mock-db] could not read persisted demo data, reseeding', e);
      }
    }
    return seed();
  }

  async ready(): Promise<MockDbState> {
    if (this.state) return this.state;
    this.loading ??= this.load().then((s) => (this.state = s));
    return this.loading;
  }

  /** Read/write a customer's record. Throws UNAUTHORIZED for unknown ids. */
  async customer(id: ID | null | undefined): Promise<MockCustomerRecord> {
    const state = await this.ready();
    const record = id ? state.customers[id] : undefined;
    if (!record) throw new AppError('UNAUTHORIZED', 'Please log in to continue.', { status: 401 });
    return record;
  }

  async findCustomerIdByEmail(email: string): Promise<ID | null> {
    const state = await this.ready();
    return state.emailIndex[email.trim().toLowerCase()] ?? null;
  }

  async insertCustomer(record: MockCustomerRecord): Promise<void> {
    const state = await this.ready();
    state.customers[record.profile.id] = record;
    state.emailIndex[record.profile.email.trim().toLowerCase()] = record.profile.id;
    this.save();
  }

  async reindexEmail(oldEmail: string, newEmail: string, id: ID): Promise<void> {
    const state = await this.ready();
    delete state.emailIndex[oldEmail.trim().toLowerCase()];
    state.emailIndex[newEmail.trim().toLowerCase()] = id;
    this.save();
  }

  /** Schedule a write of the current state. Call after every mutation. */
  save(): void {
    if (!config.mock.persist || !this.state) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.state)).catch((e) => console.warn('[mock-db] save failed', e));
    }, 250);
  }

  async reset(): Promise<void> {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.state = seed();
    this.loading = Promise.resolve(this.state);
    if (config.mock.persist) await AsyncStorage.removeItem(STORAGE_KEY);
  }
}

export const mockDb = new MockDatabase();

/** Restore the demo seed (wipes simulated orders, bookings, edits and sign-ups). */
export function resetMockDatabase(): Promise<void> {
  return mockDb.reset();
}

/** Simulated network latency. */
export function latency(ms: number = config.mock.latencyMs): Promise<void> {
  return ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();
}
