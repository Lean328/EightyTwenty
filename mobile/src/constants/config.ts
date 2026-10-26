/**
 * Runtime configuration from EXPO_PUBLIC_* environment variables (see .env.example).
 *
 * EXPO_PUBLIC_ values are inlined into the JavaScript bundle at build time and are
 * readable by anyone with the app — never put secrets here.
 */
export type DataSource = 'mock' | 'api';

function readNumber(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && value !== undefined && value !== '' ? n : fallback;
}

function readBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return value === 'true' || value === '1';
}

const dataSource: DataSource = process.env.EXPO_PUBLIC_DATA_SOURCE === 'api' ? 'api' : 'mock';

export const config = {
  dataSource,
  api: {
    baseUrl: (process.env.EXPO_PUBLIC_API_BASE_URL ?? '').replace(/\/+$/, ''),
    timeoutMs: readNumber(process.env.EXPO_PUBLIC_API_TIMEOUT_MS, 15000),
  },
  mock: {
    latencyMs: readNumber(process.env.EXPO_PUBLIC_MOCK_LATENCY_MS, 350),
    /** Persist simulated data across app restarts (AsyncStorage). */
    persist: readBool(process.env.EXPO_PUBLIC_MOCK_PERSIST, true),
    /** `declined` demonstrates the "We couldn't take this one" order outcome. */
    orderOutcome: process.env.EXPO_PUBLIC_MOCK_ORDER_OUTCOME === 'declined' ? 'declined' : 'normal',
  },
} as const;

export function assertApiConfigured(): void {
  if (config.dataSource === 'api' && !config.api.baseUrl) {
    throw new Error('EXPO_PUBLIC_DATA_SOURCE=api requires EXPO_PUBLIC_API_BASE_URL to be set.');
  }
}
