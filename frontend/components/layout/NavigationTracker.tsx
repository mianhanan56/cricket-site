'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
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
  const router = useRouter();
  // The first run is this document's own entry, not a navigation away from
  // something. Counting it would make every cold landing look poppable.
  const first = useRef(true);
  const traversedAt = useRef(0);

  // Back and forward replay the router's copy of a page without asking the
  // server. Links already fetch fresh (staleTimes.dynamic is 0); a traversal
  // keeps showing its copy and revalidates behind it.
  useEffect(() => {
    const onPop = () => {
      traversedAt.current = Date.now();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    pushNavigation();
    // A traversal that only changed the query leaves no pathname change to consume it.
    if (Date.now() - traversedAt.current < 1_000) {
      traversedAt.current = 0;
      router.refresh();
    }
  }, [pathname, router]);

  return null;
}
