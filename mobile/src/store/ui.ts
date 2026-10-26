import { create } from 'zustand';
import { duration } from '@/theme';
import type { CartLine, MenuItem } from '@/types';

export type TabKey = 'home' | 'menu' | 'loyalty' | 'profile';

/**
 * Global UI state: bottom sheets hosted by the app layout, toasts, tab re-selection and
 * the loyalty "new stamps" animation. Purely presentational — no business data.
 */
interface UiState {
  toast: { id: number; message: string } | null;
  showToast(message: string): void;

  item: { item: MenuItem; line?: CartLine; initialQty?: number } | null;
  openItem(item: MenuItem, options?: { line?: CartLine; initialQty?: number }): void;
  closeItem(): void;

  /** Café picker; `returnToOrderSettings` re-opens the order sheet after choosing. */
  cafePicker: { returnToOrderSettings: boolean } | null;
  openCafePicker(returnToOrderSettings?: boolean): void;
  closeCafePicker(): void;

  orderSettingsOpen: boolean;
  setOrderSettingsOpen(open: boolean): void;
  walletOpen: boolean;
  setWalletOpen(open: boolean): void;
  memberCardOpen: boolean;
  setMemberCardOpen(open: boolean): void;
  avatarOpen: boolean;
  setAvatarOpen(open: boolean): void;

  /** Incremented when the active tab is tapped again (scroll to top). */
  tabReselect: { tab: TabKey; n: number } | null;
  reselectTab(tab: TabKey): void;

  /** Stamps earned by the last order, animated in on the Loyalty tab. */
  newStamps: number;
  rewardSeen: boolean;
  setNewStamps(n: number): void;
  acknowledgeStamps(rewardReady: boolean): void;

  /** "Order placed." overlay after payment. */
  paidOverlay: { line: string } | null;
  showPaidOverlay(line: string): void;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
let paidTimer: ReturnType<typeof setTimeout> | undefined;

export const useUiStore = create<UiState>((set) => ({
  toast: null,
  showToast(message) {
    clearTimeout(toastTimer);
    set({ toast: { id: Date.now(), message } });
    toastTimer = setTimeout(() => set({ toast: null }), duration.toastVisible);
  },

  item: null,
  openItem: (item, options) => set({ item: { item, ...options } }),
  closeItem: () => set({ item: null }),

  cafePicker: null,
  openCafePicker: (returnToOrderSettings = false) => set({ cafePicker: { returnToOrderSettings }, orderSettingsOpen: false }),
  closeCafePicker: () => set((s) => ({ cafePicker: null, orderSettingsOpen: s.cafePicker?.returnToOrderSettings ?? false })),

  orderSettingsOpen: false,
  setOrderSettingsOpen: (orderSettingsOpen) => set({ orderSettingsOpen }),
  walletOpen: false,
  setWalletOpen: (walletOpen) => set({ walletOpen }),
  memberCardOpen: false,
  setMemberCardOpen: (memberCardOpen) => set({ memberCardOpen }),
  avatarOpen: false,
  setAvatarOpen: (avatarOpen) => set({ avatarOpen }),

  tabReselect: null,
  reselectTab: (tab) => set((s) => ({ tabReselect: { tab, n: (s.tabReselect?.n ?? 0) + 1 } })),

  newStamps: 0,
  rewardSeen: false,
  setNewStamps: (newStamps) => set({ newStamps, rewardSeen: false }),
  acknowledgeStamps: (rewardReady) => set({ newStamps: 0, rewardSeen: rewardReady }),

  paidOverlay: null,
  showPaidOverlay(line) {
    clearTimeout(paidTimer);
    set({ paidOverlay: { line } });
    paidTimer = setTimeout(() => set({ paidOverlay: null }), duration.paidOverlay);
  },
}));

/** True while any app-level bottom sheet is showing (pauses Home carousels, hides mini-cart). */
export const useAnySheetOpen = () =>
  useUiStore((s) => !!s.item || !!s.cafePicker || s.orderSettingsOpen || s.walletOpen || s.memberCardOpen || s.avatarOpen);

export const showToast = (message: string) => useUiStore.getState().showToast(message);
