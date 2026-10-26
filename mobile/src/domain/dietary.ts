import type { DietaryMarker, DietaryPreference } from '@/types';

/** Dietary preferences a customer can set, with their menu codes. */
export const DIETARY_OPTIONS: { name: DietaryPreference; code: string }[] = [
  { name: 'Gluten free', code: 'GF' },
  { name: 'Dairy free', code: 'DF' },
  { name: 'Vegan', code: 'VG' },
  { name: 'Vegetarian', code: 'V' },
];

const MARKER_CODES: Record<DietaryMarker, string> = {
  'GF*': 'GF opt',
  'DF*': 'DF opt',
  'Gluten free': 'GF',
  'Dairy free': 'DF',
  Vegan: 'VG',
  Vegetarian: 'V',
};

export interface DietChip {
  label: string;
  /** Matches one of the customer's dietary preferences. */
  highlighted: boolean;
}

/** Menu markers → de-duplicated chips, highlighting the customer's preferences. */
export function dietChips(markers: DietaryMarker[], preferences: DietaryPreference[]): DietChip[] {
  const prefCodes = DIETARY_OPTIONS.filter((d) => preferences.includes(d.name)).map((d) => d.code);
  const seen = new Set<string>();
  return markers
    .map((m) => MARKER_CODES[m] ?? m)
    .filter((code) => (seen.has(code) ? false : (seen.add(code), true)))
    .map((code) => ({
      label: code,
      highlighted: prefCodes.some((p) => code === p || code.startsWith(p + ' ') || (p === 'V' && code === 'VG')),
    }));
}
