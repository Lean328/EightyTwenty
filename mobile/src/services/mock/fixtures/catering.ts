import type { ImageKey } from '@/assets/imageRegistry';

/**
 * FRONTEND MOCK DATA — catering packages and prices from the design export (mock-data.js).
 * Replace with the published catering source.
 */
export interface CateringRecord {
  id: string;
  price: string;
  unit: string;
  img: ImageKey | null;
  imagePosition: string;
  blurb: string;
  items: string[];
}

// Catering packages and prices: replace with the published catering source.
export const CATERING_RECORDS: CateringRecord[] = [
  { id:'Breakfast', price:'$22', unit:'per person', img:'catering/breakfast-bagel', imagePosition:'50% 50%', blurb:'Rolls, wraps and croissants with fruit and sweets. The easy morning spread.', items:['Sandwich, wrap, croissant or roll: chicken, vegan, ham cheese tomato, or bacon egg cheese','Fruit bowl','Vegan and gluten free sweets (raw slice and donut)'] },
  { id:'Lunch', price:'$27.50', unit:'per person', img:'catering/lunch-sandwiches', imagePosition:'50% 50%', blurb:'Sliders, burgers or grilled-protein salads, served with fresh juice.', items:['Option 1: two sliders or a burger per person (chicken, beef, vegetarian, lamb or vegan) with fresh juice','Option 2: Lamb, Japanese or Super Salad with grilled chicken or grilled salmon, with fresh juice','Fresh juice: mixed vegetable or mixed fruit'] },
  { id:'Afternoon Tea', price:'$16.50', unit:'per person', img:'catering/dessert-platter', imagePosition:'50% 50%', blurb:'Something sweet, a light snack and fresh juice for the mid-afternoon lull.', items:['Something sweet: muffin, donut or raw slice','Light snacks: nachos','Fresh juice: mixed fruit or mixed vegetable'] }
];
