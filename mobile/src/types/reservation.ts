import type { ID, ISODate, ISODateTime, TimeOfDay } from './common';

export type TablePreference = 'Indoor' | 'Outdoor';

/**
 * Bookings are requests: the café confirms by email. There is no real-time availability.
 */
export type ReservationStatus = 'Requested' | 'Confirmed' | 'Cancelled';

export interface Reservation {
  id: ID;
  locationId: ID;
  date: ISODate;
  time: TimeOfDay;
  guests: number;
  seating: TablePreference;
  status: ReservationStatus;
  createdAt: ISODateTime;
}

export interface ReservationRequest {
  locationId: ID;
  date: ISODate;
  time: TimeOfDay;
  guests: number;
  seating: TablePreference;
  name: string;
  phone: string;
  email: string;
  notes: string;
}
