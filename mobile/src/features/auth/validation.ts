import { digitCount, isEmail, PASSWORD_MIN_LENGTH } from '@/utils/validation';

export type AuthMode = 'login' | 'signup';

export interface AuthForm {
  name: string;
  phone: string;
  email: string;
  password: string;
}

/** Client-side validation from the prototype's authSubmit(); returns the first error or ''. */
export function validateAuthForm(mode: AuthMode, form: AuthForm): string {
  const signup = mode === 'signup';
  if (signup && !form.name.trim()) return 'Add your full name.';
  if (signup && digitCount(form.phone) < 8) return 'Add a mobile number.';
  if (!isEmail(form.email)) return 'Enter a valid email address.';
  if (form.password.length < PASSWORD_MIN_LENGTH) return 'Your password needs at least 6 characters.';
  return '';
}
