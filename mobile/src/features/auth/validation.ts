import { digitCount, isEmail, PASSWORD_MIN_LENGTH, SIGNUP_PASSWORD_MIN_LENGTH } from '@/utils/validation';

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
  const minLength = signup ? SIGNUP_PASSWORD_MIN_LENGTH : PASSWORD_MIN_LENGTH;
  if (form.password.length < minLength) return `Your password needs at least ${minLength} characters.`;
  return '';
}
