'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

/**
 * Tab / filter state that lives in the URL, so a filtered view is linkable and
 * survives a reload — /fixtures?format=t20&type=international.
 *
 * Two deliberate choices:
 *
 *  1. The initial value comes in as a prop, read from `searchParams` by the
 *     server page — NOT from useSearchParams(). Reading it here would drop the
 *     page out of static rendering into a Suspense shell, which for fixtures
 *     and rankings means shipping HTML with no fixtures and no rankings in it.
 *  2. State is the render source and the URL is written alongside it, rather
 *     than the render waiting on a navigation. Switching tabs stays instant on
 *     data the client already holds; the URL catches up in the same tick.
 *
 * `replace`, not `push`: flicking through four tabs should not leave four
 * entries for the reader to back out of.
 *
 * @param initial values from the URL on this render (validated server-side)
 * @param defaults values that are the page's default view, and so are dropped
 *                 from the URL instead of being pinned onto every shared link
 */
export function useQueryTabs<S extends Record<string, string>>(
  initial: S,
  defaults?: Partial<S>
): [S, (patch: Partial<S>) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<S>(initial);

  // Re-sync when the URL changes underneath us — back/forward, or a link into
  // the page from elsewhere in the app. Compared by value, not identity: the
  // prop object is rebuilt on every render.
  const initialKey = JSON.stringify(initial);
  useEffect(() => {
    setState(JSON.parse(initialKey) as S);
  }, [initialKey]);

  const set = useCallback(
    (patch: Partial<S>) => {
      setState((prev) => ({ ...prev, ...patch }));

      // Built from the live location rather than a captured snapshot, so two
      // updates in the same tick can't clobber each other's params.
      const next = new URLSearchParams(window.location.search);
      for (const [key, value] of Object.entries(patch)) {
        if (!value || value === defaults?.[key]) next.delete(key);
        else next.set(key, value);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pathname, router, JSON.stringify(defaults ?? {})]
  );

  return [state, set];
}
