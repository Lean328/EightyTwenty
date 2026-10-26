import type { Location, OpeningWindow, Weekday, WeeklyHours } from '@/types';
import { BOOKING_RULES } from '@/constants/business';
import { formatHourCompact, pad2, timeToHours } from '@/utils/format';

const DAY_KEYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const WEEKDAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6];

function to24h(hh: string, mm: string, ap: string): string {
  const h = (parseInt(hh, 10) % 12) + (/pm/i.test(ap) ? 12 : 0);
  return `${pad2(h)}:${mm}`;
}

function dayInRange(part: string, dow: number): boolean {
  const range = part.match(/(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s*[–—-]\s*(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/);
  if (!range) return !/(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/.test(part);
  const a = DAY_KEYS.indexOf(range[1] as (typeof DAY_KEYS)[number]);
  const b = DAY_KEYS.indexOf(range[2] as (typeof DAY_KEYS)[number]);
  return a <= b ? dow >= a && dow <= b : dow >= a || dow <= b;
}

/**
 * Parses a published hours label into structured weekly hours.
 * e.g. "Mon–Fri 7:00am – 3:00pm · Sat–Sun closed". Returns `null` for "to be confirmed".
 * (Port of the prototype's `hoursFor`; the backend should send structured hours directly.)
 */
export function parseHoursLabel(label: string): WeeklyHours | null {
  if (!label || /to be confirmed/i.test(label)) return null;
  const parts = label.split('·').map((p) => p.trim()).filter(Boolean);
  const result = {} as WeeklyHours;
  for (const dow of WEEKDAYS) {
    let window: OpeningWindow | null = null;
    for (const part of parts) {
      if (!dayInRange(part, dow)) continue;
      if (/closed/i.test(part)) break;
      const t = part.match(/(\d{1,2}):(\d{2})\s*(am|pm)\s*[–—-]\s*(\d{1,2}):(\d{2})\s*(am|pm)/i);
      if (t) {
        window = { open: to24h(t[1]!, t[2]!, t[3]!), close: to24h(t[4]!, t[5]!, t[6]!) };
        break;
      }
    }
    result[dow] = window;
  }
  return result;
}

export function isComingSoon(location: Pick<Location, 'status' | 'weeklyHours'>): boolean {
  return location.status === 'comingSoon' || !location.weeklyHours;
}

export type DayWindow =
  | { kind: 'tbc' }
  | { kind: 'closed' }
  | { kind: 'open'; open: number; close: number; lastBooking: number };

/** Opening window for a specific date (decimal hours), as used by the booking form. */
export function windowForDate(location: Location, date: Date): DayWindow {
  if (isComingSoon(location) || !location.weeklyHours) return { kind: 'tbc' };
  const w = location.weeklyHours[date.getDay() as Weekday];
  if (!w) return { kind: 'closed' };
  const open = timeToHours(w.open) ?? 0;
  const close = timeToHours(w.close) ?? 0;
  return { kind: 'open', open, close, lastBooking: close - BOOKING_RULES.lastBookingBeforeCloseMinutes / 60 };
}

export function isOpenNow(location: Location, now: Date = new Date()): boolean {
  const w = windowForDate(location, now);
  if (w.kind !== 'open') return false;
  const h = now.getHours() + now.getMinutes() / 60;
  return h >= w.open && h < w.close;
}

/** Next opening hour as a compact label ("7am"), looking up to a week ahead. */
export function opensAtLabel(location: Location, now: Date = new Date()): string {
  const h = now.getHours() + now.getMinutes() / 60;
  for (let i = 0; i < 8; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    const w = windowForDate(location, d);
    if (w.kind === 'open' && (i > 0 || h < w.open)) return formatHourCompact(w.open);
  }
  return '';
}

export type LocationStatusTone = 'open' | 'closed' | 'soon';

export interface LocationStatus {
  tone: LocationStatusTone;
  /** "Open until 3pm", "Closed · opens 7am", "Opening soon" */
  label: string;
  open: boolean;
}

export function locationStatus(location: Location, now: Date = new Date()): LocationStatus {
  if (isComingSoon(location)) return { tone: 'soon', label: 'Opening soon', open: false };
  if (isOpenNow(location, now)) {
    const w = windowForDate(location, now);
    const close = w.kind === 'open' ? formatHourCompact(w.close) : '';
    return { tone: 'open', label: `Open until ${close}`, open: true };
  }
  return { tone: 'closed', label: `Closed · opens ${opensAtLabel(location, now)}`, open: false };
}
