'use client';

import { useEffect, useState } from 'react';
import type { SeriesLeaders } from '@/types';
import { getApiSeriesLeaders } from '@/lib/api';

const POLL_MS = 30_000;

/** The series' leaders, re-read every 30s while `live` and the tab is visible. */
export function useSeriesLeaders(
  seriesId: string,
  initial: SeriesLeaders | null,
  live: boolean
): SeriesLeaders | null {
  const [leaders, setLeaders] = useState(initial);

  useEffect(() => setLeaders(initial), [initial]);

  useEffect(() => {
    if (!live || !seriesId) return;
    let controller: AbortController | null = null;
    const read = () => {
      if (document.visibilityState !== 'visible') return;
      controller?.abort();
      controller = new AbortController();
      const { signal } = controller;
      getApiSeriesLeaders(seriesId, { signal })
        .then((next) => !signal.aborted && next && setLeaders(next))
        .catch(() => {});
    };
    read();
    const timer = window.setInterval(read, POLL_MS);
    document.addEventListener('visibilitychange', read);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', read);
      controller?.abort();
    };
  }, [seriesId, live]);

  return leaders;
}
