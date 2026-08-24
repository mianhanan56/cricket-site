'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { pushNavigation } from '@/lib/navigationDepth';

/**
 * Counts route changes so `BackButton` knows whether Back leads anywhere on
 * this site. Renders nothing.
 *
 * Lives in the root layout so its chunk loads with the document — a tracker
 * mounted further down would start counting from wherever it first appeared and
 * undercount everything before it.
 *
 * Watches the pathname only, deliberately. The query-string filters in this app
 * navigate with `router.replace`, which does not add a history entry, so
 * counting them would claim a Back target that is not there. Missing one errs
 * toward the fallback link, which is a page on this site either way.
 */
export default function NavigationTracker() {
  const pathname = usePathname();
  // The first run is this document's own entry, not a navigation away from
  // something. Counting it would make every cold landing look poppable.
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    pushNavigation();
  }, [pathname]);

  return null;
}
