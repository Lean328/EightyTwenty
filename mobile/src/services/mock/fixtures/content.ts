import type { ImageKey } from '@/assets/imageRegistry';
import type { Faq } from '@/types';

/**
 * FRONTEND MOCK DATA — offers and help content from the design export
 * (app-data.js OFFERS and the prototype's FAQ list). Replace with CMS content.
 */
export const OFFER_RECORDS: { id: string; img: ImageKey; tag: string; name: string; line: string; fine: string }[] = [
  {
    id: 'keepcups',
    img: 'promo/keep-cups',
    tag: 'In store · all cafés',
    name: 'Keep Cups',
    line: 'Buy a keep cup in store and the next two coffees are on us.',
    fine: 'Ongoing · redeemed at the counter',
  },
];

export const FAQ_RECORDS: Faq[] = [
  { question: 'How does the coffee card work?', answer: 'Every coffee earns a stamp. Collect nine and your tenth coffee is on us — any coffee, any size.' },
  { question: 'Can I change my order after paying?', answer: 'Once submitted, our kitchen gets straight to work, so orders cannot be changed or cancelled.' },
  { question: 'Is there a card surcharge?', answer: 'Card payments carry a 2.95% surcharge.' },
  { question: 'How much notice do bookings need?', answer: 'At least 12 hours. For a table today, text 0422 573 102.' },
  { question: 'Where can I use a gift card?', answer: 'At any EightyTwenty café. eGift cards are issued and redeemed through Square, and physical cards are available in store.' },
  { question: 'Which cafés are gluten free?', answer: 'Phillip is 100% Gluten Free by EightyTwenty, and Belconnen is our North Side gluten free café.' },
];

/** Loyalty programme copy (app-data.js LOYALTY). */
export const LOYALTY_PROGRAMME = {
  eligibility: 'Any coffee or hot drink, any size, at any EightyTwenty café.',
  reward: 'Your 10th coffee is free.',
} as const;
