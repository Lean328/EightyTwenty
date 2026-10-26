import { useEffect, useRef, useState } from 'react';
import { useUiStore, type TabKey } from '@/store/ui';

/** Runs `onReselect` when the user taps the already-active tab (prototype: smooth scroll to top). */
export function useTabReselect(tab: TabKey, onReselect: () => void) {
  const signal = useUiStore((s) => s.tabReselect);
  const cb = useRef(onReselect);
  useEffect(() => {
    cb.current = onReselect;
  });
  const [first] = useState(() => signal?.n);
  useEffect(() => {
    if (signal && signal.tab === tab && signal.n !== first) cb.current();
  }, [signal, tab, first]);
}
