'use client';

import { useEffect, useRef, useState } from 'react';
import type { Match, SeriesSummary } from '@/types';
import { withSeriesSchedules } from '@/lib/crex';

/**
 * Feed-derived series summaries with their real spans and totals, from each
 * series' own schedule. Null until the schedules answer, so the feed's partial
 * figures are never shown in the meantime.
 */
export function useSeriesTotals(series: SeriesSummary[], feed: Match[]): SeriesSummary[] | null {
  const [totals, setTotals] = useState<{ key: string; list: SeriesSummary[] } | null>(null);
  const latest = useRef({ series, feed });
  latest.current = { series, feed };

  // Keyed on the ids: the feed polls every few seconds, the schedules change in minutes.
  const key = series.map((s) => s.id).join(',');
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const { series: list, feed: matches } = latest.current;
    withSeriesSchedules(list, matches)
      .then((full) => !cancelled && setTotals({ key, list: full }))
      .catch(() => !cancelled && setTotals({ key, list }));
    return () => {
      cancelled = true;
    };
  }, [key]);

  return totals?.key === key ? totals.list : null;
}
