/**
 * Standard error shape for every repository implementation (mock and HTTP), so screens
 * handle failures the same way regardless of the data source.
 */
export type AppErrorCode =
  | 'NETWORK'
  | 'TIMEOUT'
  | 'UNAUTHORIZED'
  | 'SESSION_EXPIRED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'PRICE_CHANGED'
  | 'LOCATION_UNAVAILABLE'
  | 'PAYMENT_DECLINED'
  | 'NOT_IMPLEMENTED'
  | 'SERVER'
  /** The customer closed a payment sheet: nothing to show. */
  | 'CANCELLED'
  | 'UNKNOWN';

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number | null;
  /** Field-level validation messages keyed by request field name. */
  readonly fieldErrors: Record<string, string>;

  constructor(code: AppErrorCode, message: string, options: { status?: number | null; fieldErrors?: Record<string, string>; cause?: unknown } = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = options.status ?? null;
    this.fieldErrors = options.fieldErrors ?? {};
    if (options.cause !== undefined) (this as { cause?: unknown }).cause = options.cause;
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}

/** Failures where the server never judged the request — retryable, not a reason to sign out. */
const TRANSIENT_CODES: ReadonlySet<AppErrorCode> = new Set<AppErrorCode>(['NETWORK', 'TIMEOUT', 'SERVER']);

export function isTransientError(e: unknown): boolean {
  return e instanceof AppError && TRANSIENT_CODES.has(e.code);
}

/** Customer-friendly message for any thrown value. */
export function errorMessage(e: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (isAppError(e)) {
    switch (e.code) {
      case 'NETWORK':
        return 'You appear to be offline. Check your connection and try again.';
      case 'TIMEOUT':
        return 'That took too long. Please try again.';
      case 'SESSION_EXPIRED':
        return 'Your session has expired. Please log in again.';
      default:
        return e.message || fallback;
    }
  }
  return fallback;
}
