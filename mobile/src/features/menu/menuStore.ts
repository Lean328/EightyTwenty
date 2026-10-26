import { create } from 'zustand';

/** Selected menu category — kept across tab switches (and set by "Redeem in app" → Coffee). */
export const useMenuStore = create<{ categoryId: string; setCategory: (id: string) => void }>((set) => ({
  categoryId: 'allday',
  setCategory: (categoryId) => set({ categoryId }),
}));
