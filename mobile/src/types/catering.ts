import type { ID, ISODate, ISODateTime, ImageSource, Money, TimeOfDay } from './common';
import type { DietaryPreference } from './customer';

export interface CateringPackage {
  /** Also the display name: "Breakfast", "Lunch", "Afternoon Tea". */
  id: ID;
  name: string;
  /** Listed "from" price per person. */
  pricePerPerson: Money;
  /** Price exactly as published, e.g. "$27.50". */
  priceLabel: string;
  unit: string;
  image: ImageSource | null;
  /** CSS-style focal point for the feature image, e.g. "50% 50%". */
  imagePosition: string;
  blurb: string;
  inclusions: string[];
}

export type CateringEnquiryStatus = 'Enquiry sent' | 'Quoted' | 'Confirmed' | 'Closed';

export interface CateringEnquiry {
  id: ID;
  packageId: ID;
  packageName: string;
  guests: number | null;
  date: ISODate | null;
  occasion: string;
  status: CateringEnquiryStatus;
  createdAt: ISODateTime;
}

export interface CateringEnquiryRequest {
  packageId: ID;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
  occasion: string;
  date: ISODate | null;
  time: TimeOfDay | null;
  guests: number | null;
  location: string;
  dietary: DietaryPreference[];
  notes: string;
}
