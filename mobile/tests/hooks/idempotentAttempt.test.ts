import { createIdempotentAttempt } from '@/hooks/useIdempotentAttempt';
import { AppError } from '@/services/errors';

describe('idempotent attempts', () => {
  const order = { lines: [{ itemId: 'hotcoffee', qty: 1 }], expectedTotal: 5.5 };

  it('reuses the key after a network failure or timeout for the same request', () => {
    const attempt = createIdempotentAttempt('ord_');
    const key = attempt.keyFor(order);
    attempt.settle(new AppError('TIMEOUT', 'slow'));
    expect(attempt.keyFor({ ...order })).toBe(key);
    attempt.settle(new AppError('NETWORK', 'offline'));
    expect(attempt.keyFor(order)).toBe(key);
  });

  it('starts a new attempt after success, a server decision, or a changed request', () => {
    const attempt = createIdempotentAttempt('ord_');
    const key = attempt.keyFor(order);
    expect(attempt.keyFor({ ...order, expectedTotal: 6 })).not.toBe(key);

    const declined = attempt.keyFor(order);
    attempt.settle(new AppError('PAYMENT_DECLINED', 'declined'));
    expect(attempt.keyFor(order)).not.toBe(declined);

    const placed = attempt.keyFor(order);
    attempt.settle();
    expect(attempt.keyFor(order)).not.toBe(placed);
  });
});
