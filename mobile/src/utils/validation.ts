/**
 * Form validation rules, as implemented in the approved prototype.
 * Two email patterns exist in the source: account forms use the looser check,
 * the website-derived booking/catering forms use the stricter one.
 */
const EMAIL_LOOSE = /^\S+@\S+\.\S+$/;
const EMAIL_STRICT = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Account forms: sign in, sign up, edit profile, gift recipient. */
export function isEmail(value: string): boolean {
  return EMAIL_LOOSE.test(value.trim());
}

/** Reservation and catering forms (mirrors the website). */
export function isEmailStrict(value: string): boolean {
  return EMAIL_STRICT.test(value.trim());
}

export function digitCount(value: string): number {
  return (value.match(/\d/g) ?? []).length;
}

/** Australian mobile/landline numbers have at least 8 digits. */
export function isPhone(value: string): boolean {
  return digitCount(value) >= 8;
}

export function isBlank(value: string | null | undefined): boolean {
  return !value || !value.trim();
}

export const PASSWORD_MIN_LENGTH = 6;
/** New accounts: the backend's password rule (Django validators) needs 10+ characters. */
export const SIGNUP_PASSWORD_MIN_LENGTH = 10;
