import { bookingEmailDraft, checkBookingTime, validateReservation } from '@/domain/reservations';
import { LOCATIONS } from '@/services/mock/catalog';
import { at } from '../helpers';

const loc = (id: string) => LOCATIONS.find((l) => l.id === id)!;
const NOW = at(2026, 10, 8, 23, 50); // Thursday night

describe('checkBookingTime', () => {
  it('shows the café hours before a time is entered', () => {
    const c = checkBookingTime(loc('phillip'), '2026-10-15', null, NOW);
    expect(c).toEqual({ ok: false, message: '', hint: 'Phillip · 7:00 am – 3:00 pm · last booking 2:30 pm' });
  });

  it('rejects closed dates', () => {
    expect(checkBookingTime(loc('civic'), '2026-10-17', '10:00', NOW).message).toBe('Café is closed on this date');
  });

  it('rejects times outside opening hours or after last booking', () => {
    expect(checkBookingTime(loc('phillip'), '2026-10-15', '06:30', NOW).message).toBe('Café is closed at this time');
    expect(checkBookingTime(loc('phillip'), '2026-10-15', '14:45', NOW).message).toBe('Café is closed at this time');
    expect(checkBookingTime(loc('phillip'), '2026-10-15', '14:30', NOW).ok).toBe(true);
  });

  it('requires 12 hours’ notice', () => {
    expect(checkBookingTime(loc('braddon'), '2026-10-09', '10:00', NOW).message).toBe('Bookings need at least 12 hours’ notice');
    expect(checkBookingTime(loc('braddon'), '2026-10-09', '12:00', NOW).ok).toBe(true);
  });

  it('cannot book a café whose hours are to be confirmed', () => {
    expect(checkBookingTime(loc('akuna'), '2026-10-15', '10:00', NOW).message).toBe('Hours for this café are still to be confirmed');
  });
});

describe('validateReservation', () => {
  const form = { locationId: 'braddon', guests: '2', date: '2026-10-15', time: '10:00', seating: 'Indoor' as const, name: 'Sophie', phone: '0400 123 456', email: 'sophie@example.com', notes: '' };

  it('accepts a complete request', () => {
    expect(validateReservation(form, true)).toEqual({});
  });

  it('flags every invalid field', () => {
    expect(validateReservation({ ...form, guests: '0', date: '', name: ' ', phone: '123', email: 'x@y' }, false)).toEqual({ guests: true, date: true, time: true, name: true, phone: true, email: true });
  });
});

describe('bookingEmailDraft', () => {
  it('addresses the café inbox with an encoded body', () => {
    const url = bookingEmailDraft(loc('braddon'), { locationId: 'braddon', guests: 2, date: '2026-10-15', time: '10:00', seating: 'Outdoor', name: 'Sophie', phone: '0400', email: 's@example.com', notes: '' });
    expect(url.startsWith('mailto:braddon@eightytwentyfood.com.au?subject=')).toBe(true);
    expect(decodeURIComponent(url)).toContain('Special requests: None');
    expect(decodeURIComponent(url)).toContain('Table: Outdoor');
  });
});
