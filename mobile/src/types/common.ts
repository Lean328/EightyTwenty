/** Shared primitive types for the domain model. */

export type ID = string;
/** Calendar date, `YYYY-MM-DD`, in the café's local time (Australia/Canberra). */
export type ISODate = string;
/** 24h wall-clock time, `HH:MM`. */
export type TimeOfDay = string;
/** ISO-8601 timestamp with offset, e.g. `2026-10-08T08:12:00+11:00`. */
export type ISODateTime = string;
/** Australian dollars as a decimal number (e.g. 27.5). API mappers convert from cents. */
export type Money = number;

/**
 * Anything expo-image can render: a bundled asset (number from require) in mock mode,
 * or a remote URL in API mode.
 */
export type ImageSource = number | { uri: string };

/** Cursor pagination used by every list endpoint that can grow. */
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface PageRequest {
  cursor?: string | null;
  limit?: number;
}
