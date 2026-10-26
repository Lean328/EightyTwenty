import { createContext, useContext } from 'react';
import type { TabKey } from '@/store/ui';

/**
 * `goToTab('menu')` — the prototype's tabGo(): jump to a tab root and clear history
 * (e.g. "Order ahead", "Order here", "Full menu", "Back to home").
 * Provided by AppChrome, which owns the app stack's navigation object.
 */
export const TabNavigationContext = createContext<(tab: TabKey) => void>(() => {
  throw new Error('useGoToTab must be used inside the signed-in app layout');
});

export function useGoToTab() {
  return useContext(TabNavigationContext);
}
