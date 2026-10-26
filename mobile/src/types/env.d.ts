/// <reference types="expo/types" />

// Typed EXPO_PUBLIC_* variables (documented in .env.example). Inlined at build time.
declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_DATA_SOURCE?: 'mock' | 'api';
    EXPO_PUBLIC_API_BASE_URL?: string;
    EXPO_PUBLIC_API_TIMEOUT_MS?: string;
    EXPO_PUBLIC_WEBSITE_URL?: string;
    EXPO_PUBLIC_MOCK_LATENCY_MS?: string;
    EXPO_PUBLIC_MOCK_PERSIST?: string;
    EXPO_PUBLIC_MOCK_ORDER_OUTCOME?: 'normal' | 'declined';
  }
}
