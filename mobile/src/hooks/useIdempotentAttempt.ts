import { useState } from 'react';
import { isTransientError } from '@/services/errors';
import { localId } from '@/utils/id';

export interface IdempotentAttempt {
  /** Key for this request — the same key while the request is unchanged and unresolved. */
  keyFor(payload: unknown): string;
  /** Call with the outcome; a transient failure keeps the key for the retry. */
  settle(error?: unknown): void;
}

/** Plain (non-React) version, used by the hook and by tests. */
export function createIdempotentAttempt(prefix: string): IdempotentAttempt {
  let attempt: { key: string; payload: string } | null = null;
  return {
    keyFor(payload) {
      const json = JSON.stringify(payload);
      if (attempt?.payload !== json) attempt = { key: localId(prefix), payload: json };
      return attempt.key;
    },
    settle(error) {
      if (!error || !isTransientError(error)) attempt = null;
    },
  };
}

/**
 * Idempotency key for one attempt at a charge (placing an order, buying a gift card).
 *
 * The same key is reused while the request is unchanged and the previous try ended
 * without a server decision (offline, timeout, 5xx) — so tapping "Pay" again after a
 * dropped connection can't charge twice. Any other outcome starts a fresh attempt.
 */
export function useIdempotentAttempt(prefix: string): IdempotentAttempt {
  const [attempt] = useState(() => createIdempotentAttempt(prefix));
  return attempt;
}
