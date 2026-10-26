import type { Money, TimeOfDay } from '@/types';

/** `$12.50` — every price in the app is shown with cents. */
export function formatMoney(amount: Money): string {
  return '$' + amount.toFixed(2);
}

/** `$22` or `$27.50` — catering "from" prices drop `.00`. */
export function formatMoneyCompact(amount: Money): string {
  return '$' + (amount % 1 ? amount.toFixed(2) : String(amount));
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** `09:30` → `9:30 am` (the prototype's slot label). */
export function formatTimeOfDay(time: TimeOfDay | null | undefined): string {
  if (!time) return '';
  const h = parseInt(time, 10);
  const m = time.slice(3, 5);
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${m}${h < 12 ? ' am' : ' pm'}`;
}

/** Decimal hours → `7:00 am` (opening-hours hints). */
export function formatDecimalHours(hours: number): string {
  const hh = Math.floor(hours);
  const mm = Math.round((hours - hh) * 60);
  return formatTimeOfDay(`${pad2(hh)}:${pad2(mm)}`);
}

/** Decimal hours → `6am` / `7:30am` (compact "opens 7am"). */
export function formatHourCompact(hours: number): string {
  const hh = Math.floor(hours);
  const mm = Math.round((hours - hh) * 60);
  const h12 = ((hh + 11) % 12) + 1;
  return `${h12}${mm ? ':' + pad2(mm) : ''}${hh < 12 ? 'am' : 'pm'}`;
}

/** `TimeOfDay` → decimal hours, or `null` when malformed. */
export function timeToHours(time: string | null | undefined): number | null {
  if (!time || !/^\d{2}:\d{2}$/.test(time)) return null;
  return parseInt(time, 10) + parseInt(time.slice(3), 10) / 60;
}

export function pluralize(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/** Initials for the profile avatar: "Sophie Nguyen" → "SN". */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] ?? '';
}

export function lastNameOf(name: string): string {
  return name.trim().split(/\s+/).slice(1).join(' ');
}
