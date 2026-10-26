import { isOpenNow, locationStatus, opensAtLabel, parseHoursLabel, windowForDate } from '@/domain/hours';
import { LOCATIONS } from '@/services/mock/catalog';
import { at } from '../helpers';

const loc = (id: string) => LOCATIONS.find((l) => l.id === id)!;

describe('parseHoursLabel', () => {
  it('parses a seven-day label', () => {
    const h = parseHoursLabel('Mon–Sun 6:00am – 3:00pm')!;
    for (const d of [0, 1, 2, 3, 4, 5, 6] as const) expect(h[d]).toEqual({ open: '06:00', close: '15:00' });
  });

  it('handles weekday-only hours (Civic)', () => {
    const h = parseHoursLabel('Mon–Fri 7:00am – 3:00pm · Sat–Sun closed')!;
    expect(h[1]).toEqual({ open: '07:00', close: '15:00' });
    expect(h[5]).toEqual({ open: '07:00', close: '15:00' });
    expect(h[6]).toBeNull();
    expect(h[0]).toBeNull();
  });

  it('returns null while hours are to be confirmed', () => {
    expect(parseHoursLabel('Hours to be confirmed')).toBeNull();
  });
});

describe('opening status', () => {
  // Thursday 15 October 2026
  it('is open within hours and shows the closing time', () => {
    expect(isOpenNow(loc('braddon'), at(2026, 10, 15, 10, 0))).toBe(true);
    expect(locationStatus(loc('braddon'), at(2026, 10, 15, 10, 0)).label).toBe('Open until 3pm');
  });

  it('is closed after 3pm and shows the next opening', () => {
    expect(locationStatus(loc('braddon'), at(2026, 10, 15, 15, 0)).label).toBe('Closed · opens 6am');
    expect(locationStatus(loc('phillip'), at(2026, 10, 15, 6, 30)).label).toBe('Closed · opens 7am');
  });

  it('Civic is closed at weekends and opens again on Monday', () => {
    const saturday = at(2026, 10, 17, 10, 0);
    expect(isOpenNow(loc('civic'), saturday)).toBe(false);
    expect(opensAtLabel(loc('civic'), saturday)).toBe('7am');
    expect(windowForDate(loc('civic'), saturday)).toEqual({ kind: 'closed' });
  });

  it('coming-soon venues are never open', () => {
    expect(locationStatus(loc('akuna'), at(2026, 10, 15, 10)).label).toBe('Opening soon');
    expect(windowForDate(loc('akuna'), at(2026, 10, 15))).toEqual({ kind: 'tbc' });
  });

  it('last booking is 30 minutes before close', () => {
    expect(windowForDate(loc('braddon'), at(2026, 10, 15))).toEqual({ kind: 'open', open: 6, close: 15, lastBooking: 14.5 });
  });
});
