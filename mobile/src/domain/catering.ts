import type { CateringEnquiryRequest, CateringPackage } from '@/types';
import { CONTACT } from '@/constants/business';
import { formatMoney, formatTimeOfDay } from '@/utils/format';
import { isBlank, isEmailStrict, isPhone } from '@/utils/validation';

/** Lowest "from" price across packages, used for "From $16.50 pp". */
export function lowestPackagePrice(packages: CateringPackage[]): number {
  return packages.length ? Math.min(...packages.map((p) => p.pricePerPerson)) : 0;
}

/**
 * Indicative estimate from the listed per-person price — explicitly not a quote
 * ("Catering is quoted per event").
 */
export function cateringEstimate(pkg: CateringPackage | undefined, guests: number | null): string {
  if (!pkg || !pkg.pricePerPerson || !guests) return '';
  return `From ${formatMoney(pkg.pricePerPerson * guests).replace(/\.00$/, '')} for ${guests} ${guests === 1 ? 'person' : 'people'}`;
}

export type CateringField = 'firstName' | 'lastName' | 'email' | 'phone' | 'notes';
export type CateringErrors = Partial<Record<CateringField, true>>;

export function validateCateringEnquiry(req: CateringEnquiryRequest): CateringErrors {
  const errors: CateringErrors = {};
  if (isBlank(req.firstName)) errors.firstName = true;
  if (isBlank(req.lastName)) errors.lastName = true;
  if (!isEmailStrict(req.email)) errors.email = true;
  if (!isPhone(req.phone)) errors.phone = true;
  if (isBlank(req.notes)) errors.notes = true;
  return errors;
}

/** mailto: draft to info@ with the website's field labels. */
export function cateringEmailDraft(pkg: CateringPackage, req: CateringEnquiryRequest): string {
  const lines = [
    `First name: ${req.firstName.trim()}`,
    `Last name: ${req.lastName.trim()}`,
    `Email: ${req.email.trim()}`,
    `Phone: ${req.phone.trim()}`,
    req.company.trim() ? `Company name: ${req.company.trim()}` : '',
    req.occasion.trim() ? `Occasion?: ${req.occasion.trim()}` : '',
    req.guests ? `How many people?: ${req.guests}` : '',
    req.location.trim() ? `Location?: ${req.location.trim()}` : '',
    `Catering menu: ${pkg.name}`,
    req.dietary.length ? `Dietary requirements: ${req.dietary.join(', ')}` : '',
    `Enquiry: ${req.notes.trim()}`,
    `Date: ${req.date || 'Not specified'}`,
    req.time ? `Time: ${formatTimeOfDay(req.time)}` : '',
    `Package: ${pkg.name}`,
  ].filter(Boolean);
  return `mailto:${CONTACT.infoEmail}?subject=${encodeURIComponent('EightyTwenty catering enquiry')}&body=${encodeURIComponent(lines.join('\n'))}`;
}
