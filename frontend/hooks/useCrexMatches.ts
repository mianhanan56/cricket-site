'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CommentaryBall, InningsScore, Match, MatchEvent, MatchStatus } from '@/types';
import { getCrexMatchFeed, getCrexMatchList, getCrexScorecard } from '@/lib/crex';

// crex has no push channel we can use — their live scores come off a Firebase
// stream we deliberately don't touch (see worker-crex/README) — so the only
// option is polling.
//
// 5s is matched to the Worker's edge TTL on /matches/live, which was dropped to
// 5s alongside this. The two numbers have to move together: polling faster than
// the TTL just serves the same cached body repeatedly, and a longer TTL would
// cap freshness no matter how often we ask.
const DEFAULT_INTERVAL_MS = 5_000;

// After a failure, back off rather than hammering a struggling upstream. Each
// consecutive error doubles the wait, up to this ceiling.
const MAX_BACKOFF_MS = 5 * 60_000;

export interface UseCrexMatchesResult {
  matches: Match[];
  /** True only during the very first load, so callers can skip a flash of empty. */
  isLoading: boolean;
  /** True while a background poll is in flight. */
  isRefreshing: boolean;
  error: Error | null;
  /** When the last successful poll landed. */
  lastUpdated: Date | null;
  /** Force a poll now — resets any backoff. */
  refresh: () => void;
}

export interface UseCrexMatchesOptions {
  /** Server-rendered matches to show until the first poll returns. */
  initial?: Match[];
  intervalMs?: number;
  /** Set false to stop polling entirely (e.g. on a tab that isn't visible). */
  enabled?: boolean;
}

/**
 * Poll the crex Worker for the match list.
 *
 * Three things this does that a bare setInterval would not:
 *
 *   - Pauses while the tab is hidden, and polls immediately on return. A
 *     backgrounded tab otherwise keeps fetching scores nobody is reading.
 *   - Backs off exponentially on failure instead of retrying every 20s.
 *   - Keeps the last good data on error. A failed poll shows stale scores,
 *     never an empty list.
 */
export function useCrexMatches(options: UseCrexMatchesOptions = {}): UseCrexMatchesResult {
  const { initial = [], intervalMs = DEFAULT_INTERVAL_MS, enabled = true } = options;

  const [matches, setMatches] = useState<Match[]>(initial);
  const [isLoading, setIsLoading] = useState(initial.length === 0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Poll bookkeeping lives in refs so changing it never re-triggers the effect.
  const failures = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abort = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  // Bumping this re-runs the scheduling effect, which is how refresh() works.
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => {
    failures.current = 0;
    setTick((t) => t + 1);
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }

    const clear = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };

    const schedule = (delay: number) => {
      clear();
      timer.current = setTimeout(run, delay);
    };

    async function run(): Promise<void> {
      // Don't poll into a hidden tab — the visibility listener below restarts
      // us the moment it comes back.
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        schedule(intervalMs);
        return;
      }

      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;

      setIsRefreshing(true);
      try {
        const next = await getCrexMatchList({ signal: controller.signal });
        if (!mounted.current || controller.signal.aborted) return;

        setMatches(next);
        setError(null);
        setLastUpdated(new Date());
        failures.current = 0;
        schedule(intervalMs);
      } catch (err) {
        // An abort is us tearing down, not a failure.
        if (controller.signal.aborted || !mounted.current) return;

        setError(err instanceof Error ? err : new Error(String(err)));
        failures.current += 1;
        schedule(Math.min(intervalMs * 2 ** failures.current, MAX_BACKOFF_MS));
      } finally {
        if (mounted.current && !controller.signal.aborted) {
          setIsRefreshing(false);
          setIsLoading(false);
        }
      }
    }

    void run();

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        failures.current = 0;
        void run();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clear();
      abort.current?.abort();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, intervalMs, tick]);

  return { matches, isLoading, isRefreshing, error, lastUpdated, refresh };
}

export interface UseCrexMatchResult extends Omit<UseCrexMatchesResult, 'matches'> {
  /** Null once polling has run and the id is no longer in crex's window. */
  match: Match | null;
}

/**
 * Track one match by crex key.
 *
 * Deliberately built on the same list poll rather than a per-match endpoint:
 * `/matches/live` carries every match crex knows about, so the detail page
 * shares the Worker's cache entry with the home page instead of adding a second
 * upstream call per viewer.
 */
export function useCrexMatch(
  id: string,
  options: { initial?: Match | null; intervalMs?: number; enabled?: boolean } = {}
): UseCrexMatchResult {
  const { initial = null, intervalMs, enabled } = options;

  const { matches, ...rest } = useCrexMatches({
    initial: initial ? [initial] : [],
    intervalMs,
    enabled,
  });

  // Before the first poll lands, `matches` is just the seed — trust `initial`.
  // After it lands, a missing id means crex has aged the match out; keep
  // showing the last known state rather than blanking the page.
  const found = matches.find((m) => m.id === id) ?? null;

  return { ...rest, match: found ?? initial };
}

export interface UseCrexMatchExtrasResult {
  /** Innings with batting cards, in innings order. Empty until the first fetch. */
  innings: InningsScore[];
  /** Deliveries, newest first. */
  commentary: CommentaryBall[];
  /**
   * Non-delivery events from the same feed — wickets, ends of overs, the toss,
   * milestones — newest first.
   */
  events: MatchEvent[];
  loaded: boolean;
}

/**
 * Poll a crex match's scorecard and commentary.
 *
 * Kept separate from `useCrexMatch` because these are two extra round trips per
 * tick and only the detail page needs them — the home page must not pay for
 * them. Both are fetched together so the card and the ball-by-ball never show
 * different moments of the same over.
 *
 * Failures are swallowed on purpose: the detail page is still perfectly usable
 * with the header score alone, and a blank tab beats an error banner.
 */
export function useCrexMatchExtras(
  matchKey: string,
  options: {
    enabled?: boolean;
    intervalMs?: number;
    ballsPerOver?: number;
    /** Lets the card mark the innings in progress — see `getCrexScorecard`. */
    status?: MatchStatus;
  } = {}
): UseCrexMatchExtrasResult {
  const { enabled = true, intervalMs = DEFAULT_INTERVAL_MS, ballsPerOver, status } = options;

  const [innings, setInnings] = useState<InningsScore[]>([]);
  const [commentary, setCommentary] = useState<CommentaryBall[]>([]);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [loaded, setLoaded] = useState(false);

  const active = enabled && Boolean(matchKey);

  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const controller = new AbortController();

    async function run(): Promise<void> {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        timer = setTimeout(run, intervalMs);
        return;
      }

      const [card, feed] = await Promise.all([
        getCrexScorecard(matchKey, {
          signal: controller.signal,
          ballsPerOver,
          status,
        }).catch(() => null),
        // One walk of the ball feed for both halves, so the events strip and the
        // commentary can never show different moments of the same over.
        getCrexMatchFeed(matchKey, { signal: controller.signal }).catch(() => null),
      ]);

      if (cancelled || controller.signal.aborted) return;

      // Only overwrite on success — a failed poll keeps the last good card
      // rather than emptying the tab.
      if (card) setInnings(card);
      if (feed) {
        setCommentary(feed.balls);
        setEvents(feed.events);
      }
      if (card || feed) setLoaded(true);

      timer = setTimeout(run, intervalMs);
    }

    void run();

    return () => {
      cancelled = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [active, matchKey, intervalMs, ballsPerOver, status]);

  return { innings, commentary, events, loaded };
}
