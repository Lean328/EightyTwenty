import type { ISODate } from '@/types';
import { formatMonthTitle, startOfDay, toISODate } from '@/utils/datetime';

export interface CalendarCell {
  /** `null` for leading blanks before the 1st. */
  date: ISODate | null;
  label: string;
  disabled: boolean;
  isToday: boolean;
  selected: boolean;
}

export interface MonthGrid {
  title: string;
  cells: CalendarCell[];
  /** First day of the displayed month. */
  month: Date;
}

export const WEEKDAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;

/**
 * Month grid shared by Reserve and Catering (website `calDays`):
 * Monday-first, today ringed, nothing selectable before tomorrow.
 */
export function monthGrid(month: Date, selected: ISODate | null, now: Date = new Date()): MonthGrid {
  const base = new Date(month.getFullYear(), month.getMonth(), 1);
  const today = startOfDay(now);
  const minSelectable = new Date(today);
  minSelectable.setDate(minSelectable.getDate() + 1);
  const startDow = (base.getDay() + 6) % 7;
  const daysIn = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  const cells: CalendarCell[] = [];
  for (let i = 0; i < startDow; i++) cells.push({ date: null, label: '', disabled: true, isToday: false, selected: false });
  for (let d = 1; d <= daysIn; d++) {
    const date = new Date(base.getFullYear(), base.getMonth(), d);
    const iso = toISODate(date);
    cells.push({
      date: iso,
      label: String(d),
      disabled: date < minSelectable,
      isToday: date.getTime() === today.getTime(),
      selected: selected === iso,
    });
  }
  return { title: formatMonthTitle(base), cells, month: base };
}

export function shiftMonth(month: Date, by: number): Date {
  return new Date(month.getFullYear(), month.getMonth() + by, 1);
}
