import type { ISODate, ISODateTime } from '@/types';
import { formatTimeOfDay, pad2 } from './format';

/**
 * Date helpers. Formatting is done by hand (not Intl) so labels are identical on
 * iOS, Android and web. All values are in the device's local time zone; the cafés
 * are in Canberra (AEST/AEDT).
 */
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Local midnight for a `YYYY-MM-DD` date. */
export function parseISODate(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map((x) => parseInt(x, 10));
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Next given weekday strictly after today (the prototype's seeded "next Sunday" booking). */
export function nextWeekday(from: Date, weekday: number): Date {
  const diff = (weekday - from.getDay() + 7) % 7 || 7;
  return startOfDay(addDays(from, diff));
}

export const dayShort = (d: Date) => DAYS_SHORT[d.getDay()]!;
export const dayLong = (d: Date) => DAYS_LONG[d.getDay()]!;
export const monthShort = (d: Date) => MONTHS_SHORT[d.getMonth()]!;

/** `Sun 11 Oct` */
export function formatDateShort(d: Date): string {
  return `${dayShort(d)} ${d.getDate()} ${monthShort(d)}`;
}

/** `Sunday 11 October` */
export function formatDateLong(d: Date): string {
  return `${dayLong(d)} ${d.getDate()} ${MONTHS_LONG[d.getMonth()]}`;
}

/** `11 Oct` */
export function formatDayMonth(d: Date): string {
  return `${d.getDate()} ${monthShort(d)}`;
}

/** `October 2026` */
export function formatMonthTitle(d: Date): string {
  return `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

function clock(d: Date): string {
  return formatTimeOfDay(`${pad2(d.getHours())}:${pad2(d.getMinutes())}`);
}

/** Within the last two minutes — or slightly ahead of a stale `now` (screens refresh their clock per minute). */
function isJustNow(d: Date, now: Date): boolean {
  return now.getTime() - d.getTime() < 2 * 60 * 1000;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Loyalty / order activity: `Just now`, `Today · 8:12 am`, `Mon 5 Oct · 7:48 am`. */
export function formatActivityTime(iso: ISODateTime, now: Date = new Date()): string {
  const d = new Date(iso);
  if (isJustNow(d, now)) return 'Just now';
  if (sameDay(d, now)) return `Today · ${clock(d)}`;
  return `${formatDateShort(d)} · ${clock(d)}`;
}

/** Notification feed: `8:14 am`, `Yesterday`, `Monday`, `Last week`, `5 Oct`. */
export function formatRelativeShort(iso: ISODateTime, now: Date = new Date()): string {
  const d = new Date(iso);
  if (isJustNow(d, now)) return 'Just now';
  if (sameDay(d, now)) return clock(d);
  const days = Math.round((startOfDay(now).getTime() - startOfDay(d).getTime()) / 86_400_000);
  if (days === 1) return 'Yesterday';
  if (days > 1 && days < 7 && d.getDay() < now.getDay()) return dayLong(d);
  if (days > 1 && days < 14) return 'Last week';
  return formatDayMonth(d);
}

/** `Today` or `11 Oct` (catering requests). */
export function formatSentDay(iso: ISODateTime, now: Date = new Date()): string {
  const d = new Date(iso);
  return sameDay(d, now) ? 'Today' : formatDayMonth(d);
}

/** Month + year label for "Member since March 2024". */
export function formatMonthYear(iso: ISODate): string {
  const d = parseISODate(iso);
  return `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
}
