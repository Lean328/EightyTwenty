import { validateAuthForm } from '@/features/auth/validation';

const form = { name: 'Sam Lee', phone: '0412 345 678', email: 'sam@example.com', password: '' };

describe('validateAuthForm', () => {
  it('keeps the 6-character rule for log in', () => {
    expect(validateAuthForm('login', { ...form, password: '12345' })).toBe('Your password needs at least 6 characters.');
    expect(validateAuthForm('login', { ...form, password: '123456' })).toBe('');
  });

  it('asks new accounts for the backend minimum of 10 characters', () => {
    expect(validateAuthForm('signup', { ...form, password: 'short-pw1' })).toBe('Your password needs at least 10 characters.');
    expect(validateAuthForm('signup', { ...form, password: 'long-enough' })).toBe('');
  });
});
