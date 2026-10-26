import { imageRegistry, type ImageKey } from '@/assets/imageRegistry';
import { parseHoursLabel } from '@/domain/hours';
import type { CateringPackage, ImageSource, Location, MenuCategory, MenuItem, Offer } from '@/types';
import { CATERING_RECORDS } from './fixtures/catering';
import { OFFER_RECORDS } from './fixtures/content';
import { LOCATION_RECORDS } from './fixtures/locations';
import { CATEGORY_RECORDS, CATEGORY_SHORT_NAMES, MENU_RECORDS, type ModifierGroupRecord } from './fixtures/menu';

/**
 * Maps the raw fixtures into domain models — the mock equivalent of the API mappers.
 * Catalogue data is static (not persisted) and identical for every demo account.
 */
export function imageFor(key: ImageKey | null | undefined): ImageSource | null {
  return key ? (imageRegistry[key] as number) : null;
}

function mapGroup(g: ModifierGroupRecord) {
  return {
    id: g.id,
    name: g.name,
    required: g.required,
    maxSelections: g.max,
    options: g.options.map(([name, price]) => ({ name, price })),
  };
}

export const LOCATIONS: Location[] = LOCATION_RECORDS.map((r) => ({
  id: r.id,
  name: r.name,
  subtitle: r.sub,
  area: r.area,
  headline: r.headline,
  address: r.address,
  phone: r.phone || null,
  email: r.email || null,
  hoursLabel: r.hours,
  hoursShort: r.hoursShort,
  weeklyHours: r.tbc ? null : parseHoursLabel(r.hours),
  status: r.tbc ? 'comingSoon' : 'open',
  methods: r.methods,
  note: r.note,
  waitLabel: r.wait || null,
  image: imageFor(r.image),
  gallery: r.gallery.map((k) => imageFor(k)).filter((x): x is ImageSource => x !== null),
  externalOrderUrl: r.order || null,
  bookingLabel: r.booking,
  flags: { flagship: r.flagship, limitedMenu: r.limited, glutenFree: r.gf },
}));

export const CATEGORIES: MenuCategory[] = CATEGORY_RECORDS.map((c) => ({
  id: c.id,
  name: c.name,
  shortName: CATEGORY_SHORT_NAMES[c.id] ?? c.name,
  note: c.note,
}));

export const MENU: MenuItem[] = MENU_RECORDS.map((m) => ({
  id: m.id,
  categoryId: m.cat,
  name: m.name,
  description: m.desc,
  price: m.price,
  dietary: m.diet,
  image: imageFor(m.img),
  featured: !!m.featured,
  modifierGroups: m.mods.map(mapGroup),
}));

export const CATERING_PACKAGES: CateringPackage[] = CATERING_RECORDS.map((c) => ({
  id: c.id,
  name: c.id,
  pricePerPerson: parseFloat(c.price.replace(/[^0-9.]/g, '')) || 0,
  priceLabel: c.price,
  unit: c.unit,
  image: imageFor(c.img),
  imagePosition: c.imagePosition,
  blurb: c.blurb,
  inclusions: c.items,
}));

export const OFFERS: Offer[] = OFFER_RECORDS.map((o) => ({ id: o.id, name: o.name, tag: o.tag, line: o.line, fine: o.fine, image: imageFor(o.img) }));

export function findMenuItem(id: string): MenuItem | undefined {
  return MENU.find((m) => m.id === id);
}

export function findLocation(id: string): Location | undefined {
  return LOCATIONS.find((l) => l.id === id);
}
