'use client';

import { useEffect, useRef, useState } from 'react';
import type { MatchEvent } from '@/types';
import { getApiInningsFeed } from '@/lib/api';

const NONE: MatchEvent[] = [];
const RETRY_MS = 30_000;
const MAX_ATTEMPTS = 3;

/**
 * The feed's target rows for a chase, read once from the innings feed: the live walk holds only
 * the last few overs, so a page opened deep into a revised chase would never see the revision.
 */
export function useChaseTarget(matchKey: string, chasing: number | null): MatchEvent[] {
  const [found, setFound] = useState<{ key: string; rows: MatchEvent[] } | null>(null);
  // Bumped to retry a read that failed outright.
  const [attempt, setAttempt] = useState(0);
  const asked = useRef('');

  useEffect(() => {
    if (chasing === null || !matchKey) return;
    const tag = `${matchKey}|${attempt}`;
    if (asked.current === tag) return;
    asked.current = tag;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    let settled = false;
    void (async () => {
      let answered = false;
      // The row can be filed under the chase or the innings before it.
      for (const inning of [chasing, chasing - 1]) {
        if (inning < 0) continue;
        try {
          const { events } = await getApiInningsFeed(matchKey, inning);
          answered = true;
          const rows = events.filter((e) => e.kind === 'TARGET');
          if (rows.length) {
            settled = true;
            if (!cancelled) setFound({ key: matchKey, rows });
            return;
          }
        } catch {
          // Try the other innings; the card's first innings + 1 stands meanwhile.
        }
      }
      settled = answered;
      if (!answered && !cancelled && attempt + 1 < MAX_ATTEMPTS) timer = setTimeout(() => setAttempt((n) => n + 1), RETRY_MS);
    })();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      // A read cut short or still owed a retry is asked again when the chase comes back.
      if (!settled) asked.current = '';
    };
  }, [matchKey, chasing, attempt]);

  return found?.key === matchKey ? found.rows : NONE;
}
