import type { RepositoryContext } from '@/repositories/context';
import type { Page, PageRequest } from '@/types';
import { latency, mockDb } from '../db';
import type { MockCustomerRecord } from '../types';

/** Base class: simulated latency + access to the signed-in customer's record. */
export abstract class MockRepository {
  constructor(protected readonly ctx: RepositoryContext) {}

  protected async me(): Promise<MockCustomerRecord> {
    await latency();
    return mockDb.customer(this.ctx.getSession()?.customerId);
  }

  protected commit(): void {
    mockDb.save();
  }
}

/** Cursor pagination over an in-memory list (cursor = start index). */
export function paginate<T>(items: T[], page: PageRequest = {}): Page<T> {
  const start = page.cursor ? parseInt(page.cursor, 10) || 0 : 0;
  const limit = page.limit ?? 20;
  const slice = items.slice(start, start + limit);
  const next = start + limit < items.length ? String(start + limit) : null;
  return { items: slice, nextCursor: next };
}

/** Deep copy so callers can't mutate the mock store through returned objects. */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function nowIso(): string {
  return new Date().toISOString();
}
