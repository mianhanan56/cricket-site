'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CommentaryBall, FallOfWicket } from '@/types';
import { getCrexInningsBalls } from '@/lib/crex';
import { countedBalls, playerBalls, type BallRole } from '@/lib/playerBalls';

/** Every delivery of one innings, fetched once and shared by every popup on it. */
interface InningsStore {
  balls: CommentaryBall[];
  loadedAt: number;
  loading: Promise<void> | null;
  error: boolean;
  listeners: Set<() => void>;
}

const stores = new Map<string, InningsStore>();
// Only the innings in play changes; it is read again when a popup opens after this long.
const LIVE_FRESH_MS = 15_000;

function storeFor(matchKey: string, inning: number): InningsStore {
  const key = `${matchKey}:${inning}`;
  let s = stores.get(key);
  if (!s) {
    s = { balls: [], loadedAt: 0, loading: null, error: false, listeners: new Set() };
    stores.set(key, s);
  }
  return s;
}

const notify = (s: InningsStore) => s.listeners.forEach((l) => l());

function ensure(matchKey: string, inning: number, live: boolean): void {
  const s = storeFor(matchKey, inning);
  if (s.loading) return;
  if (s.loadedAt && (!live || Date.now() - s.loadedAt < LIVE_FRESH_MS)) return;

  s.error = false;
  s.loading = getCrexInningsBalls(matchKey, inning)
    .then((balls) => {
      // A Worker without the innings filter answers with the whole match: file every innings.
      const byInning = new Map<number, CommentaryBall[]>();
      for (const b of balls) {
        const i = b.inning ?? 0;
        const list = byInning.get(i);
        if (list) list.push(b);
        else byInning.set(i, [b]);
      }
      const now = Date.now();
      for (const [i, list] of byInning) {
        if (i === inning) continue;
        const other = storeFor(matchKey, i);
        if (!other.loading) {
          other.balls = list;
          other.loadedAt = now;
          notify(other);
        }
      }
      s.balls = byInning.get(inning) ?? [];
      s.loadedAt = now;
    })
    .catch(() => {
      s.error = true;
    })
    .finally(() => {
      s.loading = null;
      notify(s);
    });
  notify(s);
}

export interface PlayerBallsTarget {
  inning: number;
  playerId: string;
  role: BallRole;
  /** Balls faced, or legal balls bowled, per the scorecard. */
  expected: number;
  fallOfWickets?: FallOfWicket[];
  /** The innings is in play, so a held copy goes stale. */
  live?: boolean;
}

export interface UsePlayerBallsResult {
  balls: CommentaryBall[];
  loading: boolean;
  error: boolean;
  retry: () => void;
}

export function usePlayerBalls(matchKey: string, target: PlayerBallsTarget, enabled: boolean): UsePlayerBallsResult {
  const { inning, playerId, role, expected, fallOfWickets, live = false } = target;
  const snapshot = useCallback(() => {
    const s = storeFor(matchKey, inning);
    const balls = playerBalls(s.balls, inning, playerId, role, fallOfWickets);
    const met = countedBalls(balls, role) >= expected;
    // Not fetched yet reads as loading, so the popup never flashes an empty state.
    return { balls, loading: !s.error && (Boolean(s.loading) ? !met : !s.loadedAt), error: s.error && !met };
  }, [matchKey, inning, playerId, role, expected, fallOfWickets]);

  const [state, setState] = useState(snapshot);
  const [round, setRound] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const s = storeFor(matchKey, inning);
    const update = () => setState(snapshot());
    s.listeners.add(update);
    update();
    return () => {
      s.listeners.delete(update);
    };
  }, [enabled, matchKey, inning, snapshot]);

  useEffect(() => {
    if (enabled && matchKey) ensure(matchKey, inning, live);
  }, [enabled, matchKey, inning, live, round]);

  const retry = useCallback(() => setRound((r) => r + 1), []);
  return { ...state, retry };
}
