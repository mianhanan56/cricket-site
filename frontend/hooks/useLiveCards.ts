'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { InningsScore } from '@/types';
import { getApiScorecard } from '@/lib/api';
import { IDLE_INTERVAL_MS, useApiMatches } from './useApiMatches';

const POLL_MS = 30_000;
// Both Form views ask for the same cards at once; one read serves every caller for a few seconds.
const SHARE_MS = 5_000;
const reads = new Map<string, { at: number; card: Promise<InningsScore[] | null> }>();

function readCard(id: string, fresh = false): Promise<InningsScore[] | null> {
  const now = Date.now();
  const hit = reads.get(id);
  if (!fresh && hit && now - hit.at < SHARE_MS) return hit.card;
  const card = getApiScorecard(id).catch(() => null);
  reads.set(id, { at: now, card });
  return card;
}

type Cards = ReadonlyMap<string, InningsScore[]>;

/** Cards that arrived and differ from what's held; a failed read keeps the last good card. */
function merged(prev: Cards, got: ReadonlyArray<readonly [string, InningsScore[] | null]>): Cards {
  let next: Map<string, InningsScore[]> | null = null;
  for (const [id, card] of got) {
    if (!card?.length || JSON.stringify(card) === JSON.stringify(prev.get(id))) continue;
    next ??= new Map(prev);
    next.set(id, card);
  }
  return next ?? prev;
}

/**
 * Scorecards of `matchIds` (a player's recent matches): each read once, the live ones again every
 * 30s while the page is open and once more as they finish, so the player's figures move with the match.
 */
export function useLiveCards(matchIds: readonly string[]): Cards {
  const wanted = [...new Set(matchIds)].sort().join(',');
  const { matches } = useApiMatches({ enabled: wanted !== '', intervalMs: IDLE_INTERVAL_MS });
  const live = useMemo(() => {
    const ids = new Set(wanted.split(','));
    return matches
      .filter((m) => m.status === 'LIVE' && ids.has(m.id))
      .map((m) => m.id)
      .sort()
      .join(',');
  }, [matches, wanted]);

  const [cards, setCards] = useState<Cards>(() => new Map());
  const read = async (ids: string[], fresh = false) => {
    const got = await Promise.all(ids.map(async (id) => [id, await readCard(id, fresh)] as const));
    setCards((prev) => merged(prev, got));
  };

  // A match that finished minutes ago can still be ahead of the player records.
  useEffect(() => {
    if (wanted) void read(wanted.split(','));
  }, [wanted]);

  const wasLive = useRef<string[]>([]);
  useEffect(() => {
    const ids = live ? live.split(',') : [];
    const ended = wasLive.current.filter((id) => !ids.includes(id));
    wasLive.current = ids;
    if (ended.length) void read(ended, true);
    if (!ids.length) return;

    let cancelled = false;
    let busy = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = async () => {
      if (busy) return;
      busy = true;
      clearTimeout(timer);
      if (document.visibilityState === 'visible') await read(ids);
      busy = false;
      if (!cancelled) timer = setTimeout(run, POLL_MS);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void run();
    };
    void run();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [live]);

  return cards;
}
