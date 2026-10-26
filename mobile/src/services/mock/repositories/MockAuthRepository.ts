import type { AuthRepository, SignInRequest, SignUpRequest } from '@/repositories/contracts';
import { AppError } from '@/services/errors';
import type { Session } from '@/types';
import { localId } from '@/utils/id';
import { isEmail, isPhone, PASSWORD_MIN_LENGTH } from '@/utils/validation';
import { latency, mockDb } from '../db';
import { createNewCustomer, DEMO_CUSTOMER_ID } from '../fixtures/demoCustomer';
import { MockRepository } from './shared';

/**
 * DEMO AUTHENTICATION — NOT SECURE. Clearly labelled mock provider:
 * - Log in: any well-formed email + 6+ character password. Emails registered through
 *   the mock Sign up open that account; anything else opens the demo account.
 * - Sign up: creates a fresh local account (empty history).
 * - Passwords are validated for shape only and never stored.
 * Replace with HttpAuthRepository (EXPO_PUBLIC_DATA_SOURCE=api).
 */
export class MockAuthRepository extends MockRepository implements AuthRepository {
  private issue(customerId: string): Session {
    return { customerId, accessToken: `demo.${customerId}.${localId()}`, refreshToken: `demo-refresh.${customerId}`, expiresAt: null, isDemo: true };
  }

  async signIn({ email, password }: SignInRequest): Promise<Session> {
    await latency();
    if (!isEmail(email)) throw new AppError('VALIDATION', 'Enter a valid email address.', { fieldErrors: { email: 'invalid' } });
    if (password.length < PASSWORD_MIN_LENGTH) throw new AppError('VALIDATION', 'Your password needs at least 6 characters.', { fieldErrors: { password: 'too_short' } });
    const existing = await mockDb.findCustomerIdByEmail(email);
    return this.issue(existing ?? DEMO_CUSTOMER_ID);
  }

  async signUp({ name, phone, email, password }: SignUpRequest): Promise<Session> {
    await latency();
    if (!name.trim()) throw new AppError('VALIDATION', 'Add your full name.', { fieldErrors: { name: 'required' } });
    if (!isPhone(phone)) throw new AppError('VALIDATION', 'Add a mobile number.', { fieldErrors: { phone: 'invalid' } });
    if (!isEmail(email)) throw new AppError('VALIDATION', 'Enter a valid email address.', { fieldErrors: { email: 'invalid' } });
    if (password.length < PASSWORD_MIN_LENGTH) throw new AppError('VALIDATION', 'Your password needs at least 6 characters.', { fieldErrors: { password: 'too_short' } });
    if (await mockDb.findCustomerIdByEmail(email)) {
      throw new AppError('CONFLICT', 'An account with this email already exists. Log in instead.', { status: 409, fieldErrors: { email: 'taken' } });
    }
    const id = 'cus_' + Date.now().toString().slice(-8);
    await mockDb.insertCustomer(createNewCustomer({ id, name: name.trim(), email: email.trim(), phone: phone.trim() }));
    return this.issue(id);
  }

  async signOut(): Promise<void> {
    await latency(0);
  }

  async refresh(refreshToken: string): Promise<Session> {
    const id = refreshToken.replace(/^demo-refresh\./, '');
    await mockDb.customer(id).catch(() => {
      throw new AppError('SESSION_EXPIRED', 'Your session has expired. Please log in again.', { status: 401 });
    });
    return this.issue(id);
  }

  async requestPasswordReset(): Promise<void> {
    throw new AppError('NOT_IMPLEMENTED', 'Password reset isn’t connected in this preview');
  }
}
