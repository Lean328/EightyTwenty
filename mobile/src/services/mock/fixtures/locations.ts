import type { ImageKey } from '@/assets/imageRegistry';
import type { FulfilmentMethod } from '@/types';

/**
 * FRONTEND MOCK DATA — approved client snapshot (export: mock-data.js LOCATIONS,
 * plus the prototype's AREAS and SPOT copy). Replace with the published locations source.
 */
export interface LocationRecord {
  id: string;
  name: string;
  sub: string;
  area: string;
  headline: string;
  address: string;
  phone: string;
  hours: string;
  hoursShort: string;
  methods: FulfilmentMethod[];
  note: string;
  wait: string;
  image: ImageKey | null;
  gallery: ImageKey[];
  order: string;
  email: string;
  booking: string;
  flagship?: boolean;
  limited?: boolean;
  gf?: boolean;
  tbc?: boolean;
}

export const LOCATION_RECORDS: LocationRecord[] = [
  { id: 'braddon', name: 'Braddon', sub: 'Lonsdale St', area: 'Lonsdale St', headline: 'Wholesome food, great coffee on Lonsdale St.', address: '1/18 Lonsdale St, Braddon ACT 2612', phone: '0451 448 018', hours: 'Mon–Sun 6:00am – 3:00pm', hoursShort: '6am – 3pm, 7 days', methods: ['Pickup', 'Delivery', 'Dine In'], note: 'Located right at the Rainbow Roundabout', wait: '20–25 min', image: 'locations/braddon', gallery: ['locations/braddon-interior', 'locations/braddon-outdoor'], order: 'https://eightytwentybraddon.lifeintouch.net/', email: 'braddon@eightytwentyfood.com.au', booking: 'Braddon - Lonsdale St', flagship: true },
  { id: 'civic', name: 'Civic', sub: '19 Mort Street · Quick Service', area: 'Mort St · Quick Service', headline: 'Quick service on Mort Street, weekdays.', address: '19 Mort Street, Canberra City, ACT 2601', phone: '0451 227 872', hours: 'Mon–Fri 7:00am – 3:00pm · Sat–Sun closed', hoursShort: '7am – 3pm, weekdays', methods: ['Pickup', 'Delivery'], note: 'Express café, limited menu', wait: '', image: 'locations/civic', gallery: [], order: 'https://eightytwentymortst.lifeintouch.net/', email: 'northbourne@eightytwentyfood.com.au', booking: '19 Mort Street - Quick Service', limited: true },
  { id: 'coombs', name: 'Coombs', sub: 'Molonglo Valley', area: 'Molonglo Valley', headline: 'Wholesome food, great coffee in the Molonglo Valley.', address: '1 Fairhall St, Coombs ACT 2611', phone: '0450 220 890', hours: 'Mon–Sun 7:00am – 3:00pm', hoursShort: '7am – 3pm, 7 days', methods: ['Pickup', 'Delivery'], note: 'A favourite among mums and bubs', wait: '', image: 'locations/coombs', gallery: [], order: 'https://eightytwentycoombs.lifeintouch.net/', email: 'coombs@eightytwentyfood.com.au', booking: 'Coombs - Molonglo Valley' },
  { id: 'greenway', name: 'Greenway', sub: 'South Side · Tuggeranong', area: 'Tuggeranong', headline: 'Wholesome food, great coffee on the South Side.', address: '19/191 Anketell St, Greenway ACT 2900', phone: '0410 271 437', hours: 'Mon–Sun 6:00am – 3:00pm', hoursShort: '6am – 3pm, 7 days', methods: ['Pickup', 'Delivery'], note: 'Service with a smile', wait: '', image: 'locations/greenway', gallery: [], order: 'https://eightytwentygreenway.lifeintouch.net/', email: 'greenway@eightytwentyfood.com.au', booking: 'Greenway - South Side' },
  { id: 'gungahlin', name: 'Gungahlin', sub: 'Up North', area: 'Up North', headline: 'Wholesome food, great coffee, up north in Gungahlin.', address: '114/43 Hibberson St, Gungahlin ACT 2912', phone: '0435 208 945', hours: 'Mon–Sun 6:00am – 3:00pm', hoursShort: '6am – 3pm, 7 days', methods: ['Pickup', 'Delivery'], note: 'Last stop of the light rail, across from Coles', wait: '', image: 'locations/gungahlin', gallery: [], order: 'https://eightytwentygungahlin.lifeintouch.net/', email: 'gungahlin@eightytwentyfood.com.au', booking: 'Gungahlin - Up North' },
  { id: 'dickson', name: 'Dickson', sub: 'Near City', area: 'Near City', headline: 'Wholesome food, great coffee in Dickson, near the city.', address: '1/28 Challis St, Dickson', phone: '0426 633 085', hours: 'Mon–Sun 6:00am – 3:00pm', hoursShort: '6am – 3pm, 7 days', methods: ['Pickup', 'Delivery'], note: '', wait: '', image: 'locations/dickson', gallery: [], order: 'https://eightytwentydickson.lifeintouch.net/', email: 'dickson@eightytwentyfood.com.au', booking: 'Dickson - Near CIty' },
  { id: 'belconnen', name: 'Belconnen', sub: 'North Side · Gluten Free Cafe', area: 'Gluten Free Cafe', headline: 'A gluten free café on the North Side.', address: '1/25 Lathlain St, Belconnen ACT 2617', phone: '0404 972 966', hours: 'Mon–Sun 7:00am – 3:00pm', hoursShort: '7am – 3pm, 7 days', methods: ['Pickup', 'Delivery'], note: 'Coeliac-friendly kitchen, including your furry friends!', wait: '', image: 'locations/belconnen', gallery: [], order: 'https://eightytwentybelconnen.lifeintouch.net/', email: 'belconnen@eightytwentyfood.com.au', booking: 'Belconnen - North Side', gf: true },
  { id: 'phillip', name: 'Phillip', sub: '100% Gluten Free by EightyTwenty', area: '100% Gluten Free', headline: '100% gluten free, every day.', address: 'C07/11 Launceston Street, Phillip ACT 2606', phone: '0410 380 999', hours: 'Mon–Sun 7:00am – 3:00pm', hoursShort: '7am – 3pm, 7 days', methods: ['Pickup', 'Delivery'], note: 'Gluten Free Café & Shoppe. The whole menu, no cross-contamination worries', wait: '', image: 'locations/phillip', gallery: [], order: 'https://eightytwentyphillip.lifeintouch.net/', email: 'phillip@eightytwentyfood.com.au', booking: 'Phillip - 100% Gluten Free', gf: true },
  { id: 'kingston', name: 'Kingston', sub: 'Rosemary by EightyTwenty · Inner South', area: 'Rosemary by EightyTwenty', headline: 'Rosemary by EightyTwenty, in the Inner South.', address: '9/15 Tench St, Kingston ACT 2604', phone: '0461 507 674', hours: 'Mon–Sun 6:00am – 3:00pm', hoursShort: '6am – 3pm, 7 days', methods: ['Pickup', 'Delivery', 'Dine In'], note: 'Great outdoor area for pet lovers', wait: '', image: 'locations/kingston', gallery: ['locations/kingston-interior'], order: 'https://kigstongilesstreet.lifeintouch.net/', email: 'kingston@eightytwentyfood.com.au', booking: 'Kingston - Inner South' },
  { id: 'akuna', name: 'Akuna St', sub: 'Heart of City', area: 'Heart of City', headline: 'Coming soon to the heart of the city.', address: 'Akuna St, Canberra City', phone: '', hours: 'Hours to be confirmed', hoursShort: 'Hours TBC', methods: ['Pickup'], note: 'Listed venue, full details to be confirmed', wait: '', image: 'locations/akuna', gallery: [], order: '', email: '', booking: 'Akuna St - Heart of City', tbc: true },
];
