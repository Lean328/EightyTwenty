import { monthGrid } from '@/domain/calendar';
import { cateringEmailDraft, cateringEstimate, lowestPackagePrice, validateCateringEnquiry } from '@/domain/catering';
import { scheduleSlots } from '@/domain/schedule';
import { CATERING_PACKAGES } from '@/services/mock/catalog';
import { formatActivityTime, formatRelativeShort } from '@/utils/datetime';
import { formatTimeOfDay } from '@/utils/format';
import { at } from '../helpers';

describe('catering', () => {
  const breakfast = CATERING_PACKAGES.find((p) => p.id === 'Breakfast')!;

  it('lowest package price drives "From $16.50 pp"', () => {
    expect(lowestPackagePrice(CATERING_PACKAGES)).toBe(16.5);
  });

  it('estimate is a from-price, not a quote', () => {
    expect(cateringEstimate(breakfast, 20)).toBe('From $440 for 20 people');
    expect(cateringEstimate(CATERING_PACKAGES.find((p) => p.id === 'Lunch'), 3)).toBe('From $82.50 for 3 people');
    expect(cateringEstimate(breakfast, null)).toBe('');
  });

  const req = { packageId: 'Breakfast', firstName: 'Sophie', lastName: 'Nguyen', email: 's@example.com', phone: '0400 123 456', company: '', occasion: '', date: null, time: null, guests: null, location: '', dietary: [], notes: 'Meeting' };

  it('requires name, email, phone and the enquiry text', () => {
    expect(validateCateringEnquiry(req)).toEqual({});
    expect(validateCateringEnquiry({ ...req, firstName: '', lastName: '', email: 'bad', phone: '1', notes: '' })).toEqual({ firstName: true, lastName: true, email: true, phone: true, notes: true });
  });

  it('builds the info@ email draft with the website field labels', () => {
    const body = decodeURIComponent(cateringEmailDraft(breakfast, { ...req, dietary: ['Vegan'], guests: 12 }));
    expect(body).toContain('mailto:info@eightytwentyfood.com.au');
    expect(body).toContain('How many people?: 12');
    expect(body).toContain('Dietary requirements: Vegan');
    expect(body).not.toContain('Company name');
  });
});

describe('calendar', () => {
  it('is Monday-first and disables today and earlier', () => {
    const grid = monthGrid(at(2026, 10, 1), '2026-10-15', at(2026, 10, 8, 9));
    expect(grid.title).toBe('October 2026');
    // 1 October 2026 is a Thursday → three leading blanks (Mon, Tue, Wed)
    expect(grid.cells.slice(0, 3).every((c) => c.date === null)).toBe(true);
    const cell = (d: string) => grid.cells.find((c) => c.date === d)!;
    expect(cell('2026-10-08')).toMatchObject({ isToday: true, disabled: true });
    expect(cell('2026-10-09').disabled).toBe(false);
    expect(cell('2026-10-15').selected).toBe(true);
  });
});

describe('time formatting', () => {
  it('formats slots and labels', () => {
    expect(formatTimeOfDay('09:30')).toBe('9:30 am');
    expect(formatTimeOfDay('12:00')).toBe('12:00 pm');
    expect(formatTimeOfDay('00:15')).toBe('12:15 am');
    const slots = scheduleSlots();
    expect(slots[0]).toEqual({ value: '07:00', label: '7:00 am' });
    expect(slots[slots.length - 1]).toEqual({ value: '14:30', label: '2:30 pm' });
  });

  it('relative labels match the prototype copy', () => {
    const now = at(2026, 10, 8, 9, 0); // Thursday
    expect(formatRelativeShort(at(2026, 10, 8, 8, 14).toISOString(), now)).toBe('8:14 am');
    expect(formatRelativeShort(at(2026, 10, 7, 8, 0).toISOString(), now)).toBe('Yesterday');
    expect(formatRelativeShort(at(2026, 10, 5, 10, 0).toISOString(), now)).toBe('Monday');
    expect(formatRelativeShort(at(2026, 10, 1, 12, 0).toISOString(), now)).toBe('Last week');
    expect(formatRelativeShort(new Date(now.getTime() + 5000).toISOString(), now)).toBe('Just now');
    expect(formatActivityTime(at(2026, 10, 8, 8, 12).toISOString(), now)).toBe('Today · 8:12 am');
    expect(formatActivityTime(at(2026, 10, 5, 7, 48).toISOString(), now)).toBe('Mon 5 Oct · 7:48 am');
  });
});
