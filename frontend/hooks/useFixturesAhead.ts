'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getApiFixturesPage, type Fixture } from '@/lib/api';

const REFRESH_MS = 5 * 60_000;
/** A stop for a schedule busier than any seen; past the upstream's end a page wraps round. */
const MAX_PAGES = 40;

// Shared across mounts, so a remount (or React's dev double-effect) reuses the read in flight.
const pageReads = new Map<number, { at: number; read: Promise<Fixture[]> }>();

function readPage(page: number): Promise<Fixture[]> {
  const held = pageReads.get(page);
  if (held && Date.now() - held.at < REFRESH_MS) return held.read;
  const read = getApiFixturesPage(page);
  pageReads.set(page, { at: Date.now(), read });
  read.catch(() => pageReads.delete(page));
  return read;
}

export interface FixturesAhead {
  fixtures: Fixture[];
  /** Read the next schedule page; a no-op while one is loading or the schedule has ended. */
  loadMore: () => void;
  hasMore: boolean;
  loading: boolean;
}

/**
 * The upstream's schedule from today, one page (20 rows) at a time. The live feed is a
 * window and leaves out some fixtures already allocated, so upcoming lists fill from here.
 * Nothing is read until `enabled`.
 */
export function useFixturesAhead(enabled = true): FixturesAhead {
  const [pages, setPages] = useState<Fixture[][]>([]);
  const [wanted, setWanted] = useState(1);
  const [ended, setEnded] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || ended || pages.length >= wanted) return;
    let cancelled = false;
    const page = pages.length;
    setLoading(true);
    readPage(page)
      .then((rows) => {
        if (cancelled) return;
        const latest = Math.max(0, ...pages.flat().map((f) => +new Date(f.startTime)));
        const earliest = Math.min(...rows.map((f) => +new Date(f.startTime)));
        // An empty page, or one that jumps back in time, is the upstream past the end of its schedule.
        if (!rows.length || (latest && earliest < latest - 86_400_000)) setEnded(true);
        else setPages((prev) => [...prev, rows]);
      })
      .catch(() => !cancelled && setEnded(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [enabled, ended, pages, wanted]);

  // Only the pages already shown are re-read, and only while they are wanted.
  useEffect(() => {
    if (!enabled || !pages.length) return;
    const timer = setInterval(() => {
      Promise.all(pages.map((_, i) => readPage(i)))
        .then(setPages)
        .catch(() => {});
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [enabled, pages]);

  const hasMore = !ended && pages.length < MAX_PAGES;
  const loadMore = useCallback(() => {
    if (!loading && hasMore) setWanted(pages.length + 1);
  }, [loading, hasMore, pages.length]);

  // Pages end mid-day, so a match can sit on both sides of a boundary.
  const fixtures = useMemo(() => {
    const seen = new Set<string>();
    return pages.flat().filter((f) => !seen.has(f.id) && Boolean(seen.add(f.id)));
  }, [pages]);

  return { fixtures, loadMore, hasMore, loading };
}
