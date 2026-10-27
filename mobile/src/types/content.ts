import type { ID, ISODateTime, ImageSource } from './common';

export type NotificationKind = 'Order' | 'Loyalty' | 'Booking' | 'Offer' | 'Gift card';

export interface AppNotification {
  id: ID;
  kind: NotificationKind;
  text: string;
  createdAt: ISODateTime;
  unread: boolean;
  /** App screen a tap opens, when the server names one (e.g. /orders/<id>). */
  url?: string;
}

export interface Offer {
  id: ID;
  name: string;
  /** e.g. "In store · all cafés" */
  tag: string;
  /** Headline sentence. */
  line: string;
  /** Fine print, e.g. "Ongoing · redeemed at the counter" */
  fine: string;
  image: ImageSource | null;
}

export interface Faq {
  question: string;
  answer: string;
}
