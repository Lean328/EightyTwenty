import type { CustomerRepository, PreferencesRepository } from '@/repositories/contracts';
import { AppError } from '@/services/errors';
import type { Customer, CustomerPreferences, CustomerUpdate, ID, SavedAddress } from '@/types';
import { localId } from '@/utils/id';
import { isEmail } from '@/utils/validation';
import { mockDb } from '../db';
import { clone, MockRepository } from './shared';

export class MockCustomerRepository extends MockRepository implements CustomerRepository {
  async getProfile(): Promise<Customer> {
    return clone((await this.me()).profile);
  }

  async updateProfile(update: CustomerUpdate): Promise<Customer> {
    const me = await this.me();
    if (update.name !== undefined && !update.name.trim()) throw new AppError('VALIDATION', 'Add your name.', { fieldErrors: { name: 'required' } });
    if (update.email !== undefined && !isEmail(update.email)) throw new AppError('VALIDATION', 'Enter a valid email address.', { fieldErrors: { email: 'invalid' } });
    const before = me.profile.email;
    if (update.email !== undefined && update.email.trim().toLowerCase() !== before.trim().toLowerCase()) {
      const owner = await mockDb.findCustomerIdByEmail(update.email);
      if (owner && owner !== me.profile.id) throw new AppError('CONFLICT', 'Another account already uses this email.', { status: 409, fieldErrors: { email: 'taken' } });
    }
    me.profile = {
      ...me.profile,
      ...(update.name !== undefined && { name: update.name.trim() }),
      ...(update.email !== undefined && { email: update.email.trim() }),
      ...(update.phone !== undefined && { phone: update.phone.trim() }),
    };
    if (me.profile.email !== before) await mockDb.reindexEmail(before, me.profile.email, me.profile.id);
    this.commit();
    return clone(me.profile);
  }

  async requestAccountClosure(): Promise<void> {
    throw new AppError('NOT_IMPLEMENTED', 'Contact us to close your account');
  }
}

export class MockPreferencesRepository extends MockRepository implements PreferencesRepository {
  async getPreferences(): Promise<CustomerPreferences> {
    return clone((await this.me()).preferences);
  }

  async updatePreferences(patch: Partial<CustomerPreferences>): Promise<CustomerPreferences> {
    const me = await this.me();
    me.preferences = { ...me.preferences, ...patch };
    this.commit();
    return clone(me.preferences);
  }

  async getFavourites(): Promise<ID[]> {
    return [...(await this.me()).favourites];
  }

  async setFavourite(itemId: ID, favourite: boolean): Promise<ID[]> {
    const me = await this.me();
    me.favourites = favourite ? (me.favourites.includes(itemId) ? me.favourites : [...me.favourites, itemId]) : me.favourites.filter((x) => x !== itemId);
    this.commit();
    return [...me.favourites];
  }

  async getAddresses(): Promise<SavedAddress[]> {
    return clone((await this.me()).addresses);
  }

  async addAddress(address: Omit<SavedAddress, 'id'>): Promise<SavedAddress> {
    const me = await this.me();
    if (!address.line.trim()) throw new AppError('VALIDATION', 'Add an address.', { fieldErrors: { line: 'required' } });
    const saved: SavedAddress = { id: localId('adr_'), label: address.label, line: address.line.trim() };
    me.addresses.push(saved);
    this.commit();
    return clone(saved);
  }

  async removeAddress(id: ID): Promise<void> {
    const me = await this.me();
    me.addresses = me.addresses.filter((a) => a.id !== id);
    this.commit();
  }
}
