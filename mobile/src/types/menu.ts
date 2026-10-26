import type { ID, ImageSource, Money } from './common';

export interface MenuCategory {
  id: ID;
  name: string;
  /** Compact label for the category rail, e.g. "Bites". */
  shortName: string;
  /** Service note shown beside the category heading. */
  note: string;
}

export interface ModifierOption {
  name: string;
  /** Price added to the item, 0 for no charge. */
  price: Money;
}

export interface ModifierGroup {
  id: ID;
  name: string;
  required: boolean;
  /** 1 = single choice (radio). 0 = any number (checkboxes). */
  maxSelections: number;
  options: ModifierOption[];
}

/**
 * Dietary markers as published on the menu.
 * `GF*` / `DF*` mean "gluten / dairy free option on request".
 */
export type DietaryMarker = 'GF*' | 'DF*' | 'Gluten free' | 'Dairy free' | 'Vegan' | 'Vegetarian';

export interface MenuItem {
  id: ID;
  categoryId: ID;
  name: string;
  description: string;
  price: Money;
  dietary: DietaryMarker[];
  image: ImageSource | null;
  /** Shown in the Home "From the kitchen" rail. */
  featured: boolean;
  modifierGroups: ModifierGroup[];
}

/** Selected option names keyed by modifier group id. */
export type ModifierSelections = Record<ID, string[]>;
