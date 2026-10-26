import type { RepositoryContext } from '@/repositories/context';
import { AppError, isTransientError, type AppErrorCode } from '@/services/errors';
import type { Session } from '@/types';

/**
 * Centralised HTTP client for the EightyTwenty customer API.
 *
 * - JSON in/out, configurable base URL + timeout (EXPO_PUBLIC_API_*).
 * - Adds `Authorization: Bearer <accessToken>` for authenticated calls.
 * - On 401: refreshes the session once (single-flight), retries, and reports
 *   expiry to the app shell if the refresh fails.
 * - Normalises every failure into AppError (network, timeout, HTTP status, API error body).
 *
 * Expected error body (see docs/API_CONTRACTS.md):
 *   { "error": { "code": "VALIDATION", "message": "…", "fields": { "email": "invalid" } } }
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestOptions {
  body?: unknown;
  query?: Record<string, string | number | boolean | null | undefined>;
  /** Send the bearer token (default true). */
  auth?: boolean;
  /** Idempotency key for unsafe retries (orders, payments). */
  idempotencyKey?: string;
}

export interface HttpClientOptions {
  baseUrl: string;
  timeoutMs: number;
  ctx: RepositoryContext;
  /** Exchanges a refresh token; provided by HttpAuthRepository. */
  refreshSession: (refreshToken: string) => Promise<Session>;
}

const KNOWN_CODES: ReadonlySet<string> = new Set<AppErrorCode>([
  'NETWORK', 'TIMEOUT', 'UNAUTHORIZED', 'SESSION_EXPIRED', 'FORBIDDEN', 'NOT_FOUND', 'VALIDATION',
  'CONFLICT', 'PRICE_CHANGED', 'LOCATION_UNAVAILABLE', 'PAYMENT_DECLINED', 'NOT_IMPLEMENTED', 'SERVER', 'UNKNOWN',
]);

const STATUS_CODES: Record<number, AppErrorCode> = {
  400: 'VALIDATION',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'VALIDATION',
};

export class HttpClient {
  private refreshing: Promise<Session> | null = null;

  constructor(private readonly options: HttpClientOptions) {}

  get<T>(path: string, opts?: RequestOptions) {
    return this.request<T>('GET', path, opts);
  }
  post<T>(path: string, body?: unknown, opts?: RequestOptions) {
    return this.request<T>('POST', path, { ...opts, body });
  }
  patch<T>(path: string, body?: unknown, opts?: RequestOptions) {
    return this.request<T>('PATCH', path, { ...opts, body });
  }
  put<T>(path: string, body?: unknown, opts?: RequestOptions) {
    return this.request<T>('PUT', path, { ...opts, body });
  }
  delete<T = void>(path: string, opts?: RequestOptions) {
    return this.request<T>('DELETE', path, opts);
  }

  async request<T>(method: HttpMethod, path: string, opts: RequestOptions = {}, isRetry = false): Promise<T> {
    const { ctx } = this.options;
    const auth = opts.auth ?? true;
    const session = ctx.getSession();
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth && session) headers.Authorization = `Bearer ${session.accessToken}`;
    if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);
    let res: Response;
    try {
      res = await fetch(this.url(path, opts.query), {
        method,
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      });
    } catch (e) {
      const aborted = (e as { name?: string })?.name === 'AbortError';
      throw new AppError(aborted ? 'TIMEOUT' : 'NETWORK', aborted ? 'The request timed out.' : 'Network request failed.', { cause: e });
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 401 && auth && !isRetry && session?.refreshToken) {
      // Rejects with SESSION_EXPIRED (signed out) or a transient error (session kept).
      await this.refreshOnce(session.refreshToken);
      return this.request<T>(method, path, opts, true);
    }

    if (!res.ok) throw await this.toError(res);
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  private url(path: string, query?: RequestOptions['query']): string {
    const qs = Object.entries(query ?? {})
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    return `${this.options.baseUrl}${path}${qs ? `?${qs}` : ''}`;
  }

  private refreshOnce(refreshToken: string): Promise<Session> {
    this.refreshing ??= this.options
      .refreshSession(refreshToken)
      .then((s) => {
        this.options.ctx.onSessionRefreshed(s);
        return s;
      })
      .catch((e: unknown) => {
        // Offline / timeout / 5xx: keep the customer signed in and surface the error.
        if (isTransientError(e)) throw e;
        this.options.ctx.onSessionExpired();
        throw new AppError('SESSION_EXPIRED', 'Your session has expired. Please log in again.', { status: 401, cause: e });
      })
      .finally(() => {
        this.refreshing = null;
      });
    return this.refreshing;
  }

  private async toError(res: Response): Promise<AppError> {
    let body: { error?: { code?: string; message?: string; fields?: Record<string, string> } } = {};
    try {
      body = await res.json();
    } catch {
      // non-JSON error body
    }
    const bodyCode = body.error?.code;
    const code = bodyCode && KNOWN_CODES.has(bodyCode) ? (bodyCode as AppErrorCode) : (STATUS_CODES[res.status] ?? (res.status >= 500 ? 'SERVER' : 'UNKNOWN'));
    return new AppError(code, body.error?.message ?? `Request failed (${res.status}).`, { status: res.status, fieldErrors: body.error?.fields });
  }
}
