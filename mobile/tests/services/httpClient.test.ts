import type { RepositoryContext } from '@/repositories/context';
import { HttpClient } from '@/services/api/client';
import { AppError } from '@/services/errors';
import type { Session } from '@/types';

const session = (token: string): Session => ({ customerId: 'cus_1', accessToken: token, refreshToken: 'refresh-1', expiresAt: null, isDemo: false });

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function setup(opts: { refresh?: (t: string) => Promise<Session>; timeoutMs?: number } = {}) {
  let current: Session | null = session('access-1');
  const ctx: RepositoryContext = {
    getSession: () => current,
    onSessionRefreshed: jest.fn((s: Session) => (current = s)),
    onSessionExpired: jest.fn(() => (current = null)),
  };
  const refreshSession = jest.fn(opts.refresh ?? (async () => session('access-2')));
  const client = new HttpClient({ baseUrl: 'https://api.test/v1', timeoutMs: opts.timeoutMs ?? 1000, ctx, refreshSession });
  return { client, ctx, refreshSession, signOut: () => (current = null) };
}

const fetchMock = jest.fn<Promise<Response>, [string, RequestInit]>();
beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

const headersOf = (call: number) => fetchMock.mock.calls[call]![1].headers as Record<string, string>;

describe('HttpClient', () => {
  it('sends JSON with the bearer token, query string and idempotency key', async () => {
    const { client } = setup();
    fetchMock.mockResolvedValueOnce(json(200, { ok: true }));
    const res = await client.post<{ ok: boolean }>('/orders', { a: 1 }, { query: { limit: 20, cursor: undefined }, idempotencyKey: 'idem-1' });

    expect(res).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.test/v1/orders?limit=20');
    expect(init).toMatchObject({ method: 'POST', body: '{"a":1}' });
    expect(headersOf(0)).toMatchObject({ Authorization: 'Bearer access-1', 'Content-Type': 'application/json', 'Idempotency-Key': 'idem-1' });
  });

  it('omits the token for public calls and handles 204', async () => {
    const { client } = setup();
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(client.delete('/session', { auth: false })).resolves.toBeUndefined();
    expect(headersOf(0).Authorization).toBeUndefined();
  });

  it('refreshes once on 401 and retries with the new token', async () => {
    const { client, ctx, refreshSession } = setup();
    fetchMock.mockResolvedValueOnce(json(401)).mockResolvedValueOnce(json(200, { id: 'x' }));
    await expect(client.get('/me')).resolves.toEqual({ id: 'x' });
    expect(refreshSession).toHaveBeenCalledWith('refresh-1');
    expect(ctx.onSessionRefreshed).toHaveBeenCalled();
    expect(headersOf(1).Authorization).toBe('Bearer access-2');
  });

  it('shares one refresh between concurrent 401s', async () => {
    const { client, refreshSession } = setup();
    fetchMock.mockImplementation(async (_url, init) => ((init.headers as Record<string, string>).Authorization === 'Bearer access-1' ? json(401) : json(200, {})));
    await Promise.all([client.get('/a'), client.get('/b'), client.get('/c')]);
    expect(refreshSession).toHaveBeenCalledTimes(1);
  });

  it('reports SESSION_EXPIRED when the refresh fails', async () => {
    const { client, ctx } = setup({ refresh: async () => Promise.reject(new Error('revoked')) });
    fetchMock.mockResolvedValue(json(401));
    await expect(client.get('/me')).rejects.toMatchObject({ code: 'SESSION_EXPIRED', status: 401 });
    expect(ctx.onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('keeps the session when the refresh fails for network reasons', async () => {
    const { client, ctx } = setup({ refresh: async () => Promise.reject(new AppError('NETWORK', 'offline')) });
    fetchMock.mockResolvedValue(json(401));
    await expect(client.get('/me')).rejects.toMatchObject({ code: 'NETWORK' });
    expect(ctx.onSessionExpired).not.toHaveBeenCalled();
    expect(ctx.getSession()).not.toBeNull();
  });

  it('does not loop when the retried request is still 401', async () => {
    const { client, refreshSession } = setup();
    fetchMock.mockResolvedValue(json(401));
    await expect(client.get('/me')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('normalises the API error body', async () => {
    const { client } = setup();
    fetchMock.mockResolvedValueOnce(json(422, { error: { code: 'VALIDATION', message: 'Check your email', fields: { email: 'invalid' } } }));
    const e = (await client.post('/customers', {}).catch((x) => x)) as AppError;
    expect(e).toBeInstanceOf(AppError);
    expect(e).toMatchObject({ code: 'VALIDATION', message: 'Check your email', status: 422, fieldErrors: { email: 'invalid' } });
  });

  it('maps statuses when the body has no (or an unknown) code', async () => {
    const { client } = setup();
    fetchMock.mockResolvedValueOnce(new Response('<html>oops</html>', { status: 503 }));
    await expect(client.get('/x')).rejects.toMatchObject({ code: 'SERVER', status: 503 });
    fetchMock.mockResolvedValueOnce(json(404, { error: { code: 'SOMETHING_NEW', message: 'Gone' } }));
    await expect(client.get('/x')).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'Gone' });
    fetchMock.mockResolvedValueOnce(json(409, { error: { code: 'PRICE_CHANGED', message: 'Total changed' } }));
    await expect(client.get('/x')).rejects.toMatchObject({ code: 'PRICE_CHANGED' });
  });

  it('turns network failures and timeouts into NETWORK / TIMEOUT', async () => {
    const { client } = setup({ timeoutMs: 20 });
    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));
    await expect(client.get('/x')).rejects.toMatchObject({ code: 'NETWORK' });

    fetchMock.mockImplementationOnce(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })));
        }),
    );
    await expect(client.get('/slow')).rejects.toMatchObject({ code: 'TIMEOUT' });
  });
});
