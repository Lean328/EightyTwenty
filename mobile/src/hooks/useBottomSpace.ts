import { useTabBarHeight } from '@/components/layout/TabBar';
import { useCartCount } from '@/store/cart';

/** Height reserved by the floating "View cart" bar (56px + gap), as in the prototype spacer. */
export const MINI_CART_SPACE = 76;

/**
 * Bottom padding for scroll content on screens that show the floating tab bar, so nothing
 * hides under it. `withMiniCart` adds room for the mini-cart while the cart has items.
 */
export function useBottomSpace(extra: number, withMiniCart = false): number {
  const tabBar = useTabBarHeight();
  const count = useCartCount();
  return tabBar + extra + (withMiniCart && count > 0 ? MINI_CART_SPACE : 0);
}
