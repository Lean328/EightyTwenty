import type { ISODate, Location, ReservationRequest, TimeOfDay, Weekday } from '@/types';
import { BOOKING_RULES, CONTACT } from '@/constants/business';
import { parseISODate } from '@/utils/datetime';
import { formatDecimalHours, timeToHours } from '@/utils/format';
import { isBlank, isEmailStrict, isPhone } from '@/utils/validation';
import { windowForDate, type DayWindow } from './hours';

export interface BookingTimeCheck {
  ok: boolean;
  /** Validation message ('' when nothing to report). */
  message: string;
  /** Status line under the date/time fields. */
  hint: string;
}

/** Hours shown before a date is picked: the first published window (Mon → Sun). */
function defaultWindow(location: Location): DayWindow {
  if (!location.weeklyHours || location.status === 'comingSoon') return { kind: 'tbc' };
  for (const dow of [1, 2, 3, 4, 5, 6, 0] as Weekday[]) {
    const w = location.weeklyHours[dow];
    if (w) {
      const d = new Date(2026, 0, 4 + dow); // any date with that weekday
      return windowForDate(location, d);
    }
  }
  return { kind: 'closed' };
}

/**
 * Live validation of the typed time against the café's hours for the chosen day,
 * last booking 30 minutes before close, and 12 hours' notice (port of the prototype).
 */
export function checkBookingTime(location: Location, date: ISODate | null, time: TimeOfDay | null, now: Date = new Date()): BookingTimeCheck {
  const day = date ? parseISODate(date) : null;
  const win = day ? windowForDate(location, day) : defaultWindow(location);
  const t = timeToHours(time);

  const result = (ok: boolean, message: string): BookingTimeCheck => ({
    ok,
    message,
    hint:
      message ||
      (win.kind === 'open'
        ? `${location.name} · ${formatDecimalHours(win.open)} – ${formatDecimalHours(win.close)} · last booking ${formatDecimalHours(win.lastBooking)}`
        : day
          ? ''
          : 'Pick a date to see opening hours'),
  });

  if (win.kind === 'tbc') return result(false, 'Hours for this café are still to be confirmed');
  if (day && win.kind === 'closed') return result(false, 'Café is closed on this date');
  if (t === null) return result(false, '');
  if (win.kind === 'open' && (t < win.open || t > win.lastBooking)) return result(false, 'Café is closed at this time');
  if (day) {
    const when = new Date(day);
    when.setHours(Math.floor(t), Math.round((t % 1) * 60), 0, 0);
    if (when.getTime() - now.getTime() < BOOKING_RULES.minNoticeHours * 3600 * 1000) {
      return result(false, 'Bookings need at least 12 hours’ notice');
    }
  }
  return result(true, '');
}

export type ReservationField = 'guests' | 'date' | 'time' | 'name' | 'phone' | 'email';
export type ReservationErrors = Partial<Record<ReservationField, true>>;

export function validateReservation(form: Omit<ReservationRequest, 'guests'> & { guests: string }, timeOk: boolean): ReservationErrors {
  const errors: ReservationErrors = {};
  if (!(parseInt(form.guests, 10) >= 1)) errors.guests = true;
  if (!form.date) errors.date = true;
  if (!form.time || !timeOk) errors.time = true;
  if (isBlank(form.name)) errors.name = true;
  if (!isPhone(form.phone)) errors.phone = true;
  if (!isEmailStrict(form.email)) errors.email = true;
  return errors;
}

/** mailto: draft to the café's booking inbox — the current business process. */
export function bookingEmailDraft(location: Location, req: ReservationRequest): string {
  const to = location.email || CONTACT.infoEmail;
  const subject = `EightyTwenty booking request — ${location.name}`;
  const body = [
    `Café: ${location.name}`,
    `Guests: ${req.guests}`,
    `Date: ${req.date}`,
    `Time: ${req.time}`,
    `Table: ${req.seating}`,
    `Name: ${req.name.trim()}`,
    `Phone: ${req.phone.trim()}`,
    `Email: ${req.email.trim()}`,
    `Special requests: ${req.notes.trim() || 'None'}`,
  ].join('\n');
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
