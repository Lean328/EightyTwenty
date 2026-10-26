import type { ID, ISODate } from './common';

export interface Customer {
  id: ID;
  name: string;
  email: string;
  phone: string;
  memberSince: ISODate;
}

export type CustomerUpdate = Partial<Pick<Customer, 'name' | 'email' | 'phone'>>;

export type DietaryPreference = 'Gluten free' | 'Dairy free' | 'Vegan' | 'Vegetarian';

export type NotificationCategory = 'Order updates' | 'Bookings' | 'Coffee card' | 'Offers & news' | 'Gift card activity';

export interface SecuritySettings {
  /** Sign in with Face ID — UI preference only until biometric sign-in is implemented. */
  biometricSignIn: boolean;
  useLocation: boolean;
  rememberOrderSettings: boolean;
}

export interface CustomerPreferences {
  homeCafeId: ID;
  dietary: DietaryPreference[];
  notifications: Record<NotificationCategory, boolean>;
  security: SecuritySettings;
  /** Index into the avatar palette (profile icon). */
  avatar: number;
}

export type AddressLabel = 'Home' | 'Work' | 'Other';

export interface SavedAddress {
  id: ID;
  label: AddressLabel;
  line: string;
}
