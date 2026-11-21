'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { onSearchChange } from '@/lib/urlSearch';

/**
 * Tab / filter state that lives in the URL, so a filtered view is linkable and
 * survives a reload — /fixtures?format=t20&type=international.
 *
 * Pages that pass `read` are static (ISR): the server renders the default view,
 * and the URL's own filters are applied once mounted. Reading `searchParams` on
 * the server would render every request on a function, and useSearchParams()
 * would ship a Suspense shell with no list in the HTML.
 *
 * State is the render source and the URL is written alongside it with
 * history.replaceState, not router.replace: a router navigation re-renders the
 * page on the server and loading.tsx swaps in a skeleton, which throws the
 * reader back to the top. Replace, not push: flicking through four tabs should
 * not leave four entries to back out of.
 *
 * @param initial  the view to render before the URL is read
 * @param defaults values dropped from the URL instead of pinned onto every shared link
 * @param read     validates the URL's values; called on mount and whenever the query changes
 *                 (back/forward, or a link to the same page that keeps it mounted)
 */
export function useQueryTabs<S extends Record<string, string>>(
  initial: S,
  defaults?: Partial<S>,
  read?: (query: URLSearchParams) => S
): [S, (patch: Partial<S>) => void] {
  const pathname = usePathname();
  const [state, setState] = useState<S>(initial);

  // Compared by value, not identity: the prop object is rebuilt on every render.
  const initialKey = JSON.stringify(initial);
  useEffect(() => {
    setState(JSON.parse(initialKey) as S);
  }, [initialKey]);

  const readRef = useRef(read);
  readRef.current = read;
  useEffect(() => {
    const apply = () => {
      const fromUrl = readRef.current?.(new URLSearchParams(window.location.search));
      if (!fromUrl) return;
      const key = JSON.stringify(fromUrl);
      setState((prev) => (JSON.stringify(prev) === key ? prev : fromUrl));
    };
    apply();
    return onSearchChange(apply);
  }, []);

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
      window.history.replaceState(null, '', qs ? `${pathname}?${qs}` : pathname);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pathname, JSON.stringify(defaults ?? {})]
  );

  return [state, set];
}
