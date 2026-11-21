'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { recordPush, recordTraversal } from '@/lib/navigationDepth';

// In the root layout so it sees the landing entry. Pathname only: query filters use
// replaceState, which adds no history entry.
export default function NavigationTracker() {
  const pathname = usePathname();
  const router = useRouter();
  const traversedAt = useRef(0);

  useEffect(() => {
    const onPop = () => {
      // popstate fires before the router re-renders, so the effect below sees the entry already current.
      recordTraversal(window.location.pathname);
      traversedAt.current = Date.now();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    recordPush(pathname);
    // Back/forward replays the router's cached copy; revalidate behind it. A query-only
    // traversal leaves no pathname change to consume the stamp, hence the time window.
    if (Date.now() - traversedAt.current < 1_000) {
      traversedAt.current = 0;
      router.refresh();
    }
  }, [pathname, router]);

  return null;
}
