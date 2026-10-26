import type { ID, ImageSource, TimeOfDay } from './common';

export type FulfilmentMethod = 'Pickup' | 'Delivery' | 'Dine In';

/** 0 = Sunday … 6 = Saturday (JavaScript `Date#getDay`). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface OpeningWindow {
  open: TimeOfDay;
  close: TimeOfDay;
}

/** Structured opening hours. `null` = closed that day. */
export type WeeklyHours = Record<Weekday, OpeningWindow | null>;

export interface Location {
  id: ID;
  name: string;
  /** e.g. "Lonsdale St", "19 Mort Street · Quick Service" */
  subtitle: string;
  /** Short area label used on cards, e.g. "Tuggeranong". */
  area: string;
  /** Editorial headline on the Home featured card. */
  headline: string;
  address: string;
  phone: string | null;
  email: string | null;
  /** Human-readable hours exactly as published, e.g. "Mon–Sun 6:00am – 3:00pm". */
  hoursLabel: string;
  hoursShort: string;
  /** Structured hours; `null` while hours are to be confirmed. */
  weeklyHours: WeeklyHours | null;
  /** `comingSoon` venues are listed but can't take orders or bookings. */
  status: 'open' | 'comingSoon';
  methods: FulfilmentMethod[];
  note: string;
  /** Typical ASAP wait, e.g. "20–25 min". `null` falls back to the default wait. */
  waitLabel: string | null;
  image: ImageSource | null;
  /** Additional photography (not rendered by the current design — see docs/ASSET_AUDIT.md). */
  gallery: ImageSource[];
  /** Existing third-party online ordering URL (TapTouch / lifeintouch). */
  externalOrderUrl: string | null;
  /** Name used by the café's booking inbox. */
  bookingLabel: string;
  flags: {
    flagship?: boolean;
    limitedMenu?: boolean;
    glutenFree?: boolean;
  };
}
