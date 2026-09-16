'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CommentaryBall,
  InningsScore,
  Match,
  MatchConditions,
  MatchEvent,
  MatchStatus,
  OverSummary,
  SquadPlayer,
} from '@/types';
import {
  clearResumedStoppages,
  getCrexMatchFeed,
  getCrexMatchInfo,
  getCrexMatchList,
  getCrexScorecard,
} from '@/lib/crex';
import type { StoppageWatch } from '@/lib/crex';

// crex has no push channel we can use — their live scores come off a Firebase
// stream we deliberately don't touch (see worker-crex/README) — so the only
// option is polling.
//
// 2s is matched to the Worker's edge TTL on /matches/live, which was dropped to
// 2s alongside this. The two numbers have to move together: polling faster than
// the TTL just serves the same cached body repeatedly, and a longer TTL would
// cap freshness no matter how often we ask.
const DEFAULT_INTERVAL_MS = 2_000;

/**
 * The cadence for a match that is not being played.
 *
 * A page still has to poll when the match on it is upcoming — that is how it
 * finds out the match has started — but nothing about a fixture two hours out
 * changes second to second, so it asks at a rate suited to noticing a toss
 * rather than a delivery.
 */
export const IDLE_INTERVAL_MS = 30_000;

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
  // What each match's reported break looked like last poll, so a break the score
  // has since moved under can be spotted as a stale one — see
  // `clearResumedStoppages`. Poll-to-poll memory, so a ref rather than state.
  const stoppages = useRef(new Map<string, StoppageWatch>());
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
      // Don't poll into a hidden tab, and don't re-arm a timer either: a
      // background tab's setTimeout is throttled to about once a minute, so a
      // re-armed chain comes back minutes late. Drop it and let the visibility
      // listener below restart us the moment the tab returns.
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        clear();
        return;
      }

      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;

      setIsRefreshing(true);
      try {
        const next = await getCrexMatchList({ signal: controller.signal });
        if (!mounted.current || controller.signal.aborted) return;

        const landed = new Date();
        setMatches(clearResumedStoppages(next, stoppages.current, landed.getTime()));
        setError(null);
        setLastUpdated(landed);
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
        clear();
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
  /** End-of-over cards from the same feed, newest first. */
  overs: OverSummary[];
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
    /**
     * Keep polling, rather than fetching once and stopping.
     *
     * False on a finished match, which is the whole point: a result's card and
     * feed are final, and the page used to go on asking for them twice every
     * two seconds for as long as the tab stayed open. Flipping this to false as
     * a match ends still costs one last fetch — the effect re-runs — which is
     * exactly the one that picks up the closing card.
     */
    repeat?: boolean;
    ballsPerOver?: number;
    /** Lets the card mark the innings in progress — see `getCrexScorecard`. */
    status?: MatchStatus;
  } = {}
): UseCrexMatchExtrasResult {
  const {
    enabled = true,
    intervalMs = DEFAULT_INTERVAL_MS,
    repeat = true,
    ballsPerOver,
    status,
  } = options;

  const [innings, setInnings] = useState<InningsScore[]>([]);
  const [commentary, setCommentary] = useState<CommentaryBall[]>([]);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [overs, setOvers] = useState<OverSummary[]>([]);
  const [loaded, setLoaded] = useState(false);

  const active = enabled && Boolean(matchKey);

  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let failures = 0;
    const controller = new AbortController();

    const clear = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };

    async function run(): Promise<void> {
      // Same as the list poll: park the chain rather than re-arm a throttled
      // timer, and let the visibility listener below resume it.
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        clear();
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
        setOvers(feed.overs);
      }
      if (card || feed) setLoaded(true);

      // Both halves failing is the signal to slow down — the same exponential
      // back-off `useCrexMatches` uses, and for the same reason: a struggling
      // Worker should not be asked twice a second while it recovers.
      failures = card || feed ? 0 : failures + 1;

      if (!repeat) return;
      timer = setTimeout(
        run,
        failures ? Math.min(intervalMs * 2 ** failures, MAX_BACKOFF_MS) : intervalMs
      );
    }

    void run();

    const onVisible = () => {
      if (repeat && document.visibilityState === 'visible') {
        clear();
        void run();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      controller.abort();
      clear();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [active, matchKey, intervalMs, repeat, ballsPerOver, status]);

  return { innings, commentary, events, overs, loaded };
}

/**
 * Deliveries the live poll never reaches.
 *
 * The poll's walk stops at three overs, because it runs every couple of seconds
 * and every page of it is an upstream request (see MIN_BALLS in lib/crex). That
 * is the right window for the header's ball strip and far too small for a
 * commentary tab: with three overs held, a "wickets" filter is empty on almost
 * every match, and a reader who steps away for a session cannot catch up.
 *
 * So this walks the same feed deeper, once, when the tab is opened, and again
 * when the reader asks for more — never on the poll. The live tail keeps
 * arriving on its own and the caller merges the two by id.
 */
export interface UseCrexCommentaryHistoryResult {
  balls: CommentaryBall[];
  overs: OverSummary[];
  /** A walk is in flight — the first one, or a "load older". */
  loading: boolean;
  /** The feed has nothing older left to hand back. */
  exhausted: boolean;
  /** Walk further back. No-op while one is already running, or once exhausted. */
  loadMore: () => void;
}

/** Roughly ten overs on the first walk, and five more per "load older". */
const HISTORY_BALLS = 60;
const HISTORY_PAGES = 14;
const MORE_BALLS = 30;
const MORE_PAGES = 8;

export function useCrexCommentaryHistory(
  matchKey: string,
  options: { enabled?: boolean } = {}
): UseCrexCommentaryHistoryResult {
  const { enabled = true } = options;

  const [balls, setBalls] = useState<CommentaryBall[]>([]);
  const [overs, setOvers] = useState<OverSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  // The oldest id reached so far, and the cursor the next walk continues from.
  const cursor = useRef<string | null>(null);
  // Guards the first walk against an effect that re-runs, and both walks against
  // a second one starting while the first is still out.
  const inFlight = useRef(false);
  const started = useRef('');

  const walk = useCallback(
    async (from: string | null) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setLoading(true);

      try {
        const feed = await getCrexMatchFeed(matchKey, {
          minBalls: from ? MORE_BALLS : HISTORY_BALLS,
          maxPages: from ? MORE_PAGES : HISTORY_PAGES,
          ...(from ? { before: from } : null),
        });

        // Merged by id rather than replaced: a "load older" walk returns only
        // the older window, and the overs already on screen must stay.
        setBalls((prev) => mergeById(prev, feed.balls, (b) => b.id));
        setOvers((prev) => mergeById(prev, feed.overs, (o) => o.id));
        cursor.current = feed.oldest ?? cursor.current;
        if (feed.exhausted || !feed.oldest) setExhausted(true);
      } catch {
        // A failed walk leaves what is already held; the reader can ask again.
      } finally {
        inFlight.current = false;
        setLoading(false);
      }
    },
    [matchKey]
  );

  useEffect(() => {
    if (!enabled || !matchKey || started.current === matchKey) return;
    started.current = matchKey;
    void walk(null);
  }, [enabled, matchKey, walk]);

  const loadMore = useCallback(() => {
    if (exhausted || inFlight.current) return;
    void walk(cursor.current);
  }, [exhausted, walk]);

  return { balls, overs, loading, exhausted, loadMore };
}

/** Two feeds as one, newest first, keyed on the feed's own ids. */
function mergeById<T>(a: T[], b: T[], key: (item: T) => string): T[] {
  const byId = new Map<string, T>();
  for (const item of [...a, ...b]) byId.set(key(item), item);
  // The feed's id is an epoch, and its string form sorts the same way for the
  // 13-digit window this app will ever see — but the numeric compare is what is
  // actually meant, so it is what is written.
  return [...byId.values()].sort((x, y) => Number(key(y)) - Number(key(x)));
}

/**
 * Both squads for a match, keyed by team f_key.
 *
 * Fetched once rather than polled, and kept out of `useCrexMatchExtras` for the
 * same reason: a squad is announced, not scored. It changes when a team names
 * its XI — a day or two before the toss — and never once play starts, so
 * putting it on the 5s tick would be a third round trip every poll for a list
 * that is identical every time.
 *
 * Failures are swallowed, like the extras above: no squad simply means the
 * squad section is not shown.
 */
export function useCrexMatchSquads(
  matchKey: string,
  options: { enabled?: boolean } = {}
): {
  squads: Record<string, SquadPlayer[]>;
  /** The forecast, the officials, the broadcasters and the ground's record. */
  conditions: MatchConditions | null;
  loaded: boolean;
} {
  const { enabled = true } = options;

  const [squads, setSquads] = useState<Record<string, SquadPlayer[]>>({});
  const [conditions, setConditions] = useState<MatchConditions | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!enabled || !matchKey) return;

    let cancelled = false;
    const controller = new AbortController();

    getCrexMatchInfo(matchKey, { signal: controller.signal })
      .then((next) => {
        if (cancelled || controller.signal.aborted) return;
        setSquads(next.squads);
        setConditions(next.conditions);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [enabled, matchKey]);

  return { squads, conditions, loaded };
}
