import type { Href } from 'expo-router';
import { config } from '@/constants/config';
import { isComingSoon } from '@/domain/hours';
import { lowestPackagePrice } from '@/domain/catering';
import type { CateringPackage, ImageSource, Location, Offer } from '@/types';
import { formatMoneyCompact } from '@/utils/format';

export interface WhatsOnItem {
  key: string;
  image: ImageSource | null;
  tag: string;
  title: string;
  /** Short serif line in the 3-up grid. */
  brief: string;
  sub: string;
  href: Href;
}

/**
 * The Home "What's on" list, built exactly as the prototype did: in-store offers first,
 * then the coming-soon café, catering packages and Rosemary (Kingston).
 * TODO(content): editorial copy for the Kingston tile should come from the CMS.
 */
export function buildWhatsOn(offers: Offer[], locations: Location[], packages: CateringPackage[]): WhatsOnItem[] {
  const items: WhatsOnItem[] = offers.map((o) => ({ key: o.id, image: o.image, tag: 'Offer · in store', title: o.name, brief: o.name, sub: o.line, href: '/offers' }));
  const soon = locations.find((l) => isComingSoon(l));
  if (soon) {
    items.push({ key: 'soon-' + soon.id, image: soon.image, tag: 'Coming soon', title: `${soon.name}, ${soon.subtitle}`, brief: `${soon.name}, ${soon.subtitle}`, sub: 'A new EightyTwenty café. Hours to be confirmed.', href: `/cafes/${soon.id}` });
  }
  if (packages.length) {
    const from = formatMoneyCompact(lowestPackagePrice(packages));
    const names = packages.map((p) => p.name).join(', ').replace(/, ([^,]*)$/, ' & $1');
    const brief = config.features.showPrices ? `From ${from} per person` : 'Catering for your team';
    const sub = config.features.showPrices ? `Packages from ${from} per person.` : 'Packages for meetings and events.';
    items.push({ key: 'catering', image: packages[0]!.image, tag: 'Catering', title: names, brief, sub, href: '/catering' });
  }
  const kingston = locations.find((l) => l.id === 'kingston');
  if (kingston) {
    items.push({ key: 'kingston', image: kingston.image, tag: 'Inner South', title: 'Rosemary by EightyTwenty', brief: 'Rosemary, Kingston', sub: 'Our Kingston café on Tench St.', href: '/cafes/kingston' });
  }
  return items;
}

/** The lead tile's sub-line (the Keep Cups offer gets its shorter home copy). */
export function leadSubline(lead: WhatsOnItem | undefined, offers: Offer[]): string {
  if (!lead) return '';
  return offers[0] && lead.title === offers[0].name ? 'Buy a keep cup, your next two coffees are on us.' : lead.sub;
}

export function greeting(hour: number): string {
  return hour < 11 ? 'Good morning' : hour < 15 ? 'Good afternoon' : 'Good evening';
}

/** "Launceston St" — the street from a café address, as shown on the featured card. */
export function streetLabel(address: string): string {
  return (address.split(',')[0] ?? '')
    .replace(/^[\w/]+\s+/, '')
    .replace(/\bStreet\b/, 'St')
    .replace(/\bAvenue\b/, 'Ave');
}

/** Home pill copy for the newest unread notification. */
export const LATEST_SHORT: Record<string, string> = {
  Order: 'Order ready for pickup',
  Loyalty: 'Stamp added to your coffee card',
  Booking: 'Table booking confirmed',
  Offer: 'New offer at your café',
  'Gift card': 'Gift card balance updated',
};
