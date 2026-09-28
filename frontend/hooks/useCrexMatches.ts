'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
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
import { keepNewest } from '@/lib/liveScore';

// crex has no push channel we can use — their live scores come off a Firebase
// stream we deliberately don't touch (see worker-crex/README) — so the only
// option is polling.
//
// 2s is matched to the Worker's edge TTL on /matches/live. The two numbers have
// to move together: polling faster than the TTL just serves the same cached body.
const DEFAULT_INTERVAL_MS = 2_000;

/**
 * The cadence for a match that is not being played — fast enough to notice a
 * toss, cheap enough to leave open.
 */
export const IDLE_INTERVAL_MS = 30_000;

/**
 * A hidden tab polls only for a subscriber that asked to (the alert engine, when
 * a browser notification is waiting on it), and no faster than this — Chrome
 * holds a long-hidden tab's timers to about once a minute regardless.
 */
export const HIDDEN_INTERVAL_MS = 60_000;

// Each consecutive failure doubles the wait, up to this ceiling.
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
  /** Keep polling while the tab is hidden, at `HIDDEN_INTERVAL_MS` at most. */
  background?: boolean;
}

// ---------------------------------------------------------------------------
// One shared channel for the match list. Every subscriber reads the same
// snapshot; the channel polls at the fastest interval any live subscriber asks
// for, so the home board, the hero, the alert engine and search cost one
// request per tick between them instead of one each.
// ---------------------------------------------------------------------------

interface ChannelState {
  matches: Match[];
  lastUpdated: Date | null;
  error: Error | null;
  isRefreshing: boolean;
  /** The first poll has resolved, successfully or not. */
  settled: boolean;
}

const SERVER_STATE: ChannelState = {
  matches: [],
  lastUpdated: null,
  error: null,
  isRefreshing: false,
  settled: false,
};

const channel = {
  state: SERVER_STATE,
  listeners: new Set<() => void>(),
  subscribers: new Map<number, { interval: number; background: boolean }>(),
  nextId: 0,
  timer: null as ReturnType<typeof setTimeout> | null,
  abort: null as AbortController | null,
  failures: 0,
  // What each match's reported break looked like last poll — see `clearResumedStoppages`.
  stoppages: new Map<string, StoppageWatch>(),
  visibilityBound: false,
};

function emit(patch: Partial<ChannelState>) {
  channel.state = { ...channel.state, ...patch };
  channel.listeners.forEach((l) => l());
}

const isHidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';

function wantedInterval(): number | null {
  const subs = [...channel.subscribers.values()];
  if (!isHidden()) return subs.length ? Math.min(...subs.map((s) => s.interval)) : null;
  const background = subs.filter((s) => s.background);
  return background.length ? Math.max(HIDDEN_INTERVAL_MS, Math.min(...background.map((s) => s.interval))) : null;
}

function clearTimer() {
  if (channel.timer) clearTimeout(channel.timer);
  channel.timer = null;
}

function schedule(delay: number) {
  clearTimer();
  channel.timer = setTimeout(poll, Math.max(0, delay));
}

async function poll(): Promise<void> {
  const interval = wantedInterval();
  if (interval === null) {
    clearTimer();
    return;
  }
  // A hidden tab with no background subscriber parks; the visibility listener restarts it.

  channel.abort?.abort();
  const controller = new AbortController();
  channel.abort = controller;
  emit({ isRefreshing: true });

  try {
    const next = await getCrexMatchList({ signal: controller.signal });
    if (controller.signal.aborted) return;

    const landed = new Date();
    channel.failures = 0;
    emit({
      matches: clearResumedStoppages(keepNewest(channel.state.matches, next), channel.stoppages, landed.getTime()),
      lastUpdated: landed,
      error: null,
      isRefreshing: false,
      settled: true,
    });
    schedule(wantedInterval() ?? interval);
  } catch (err) {
    if (controller.signal.aborted) return;
    channel.failures += 1;
    emit({
      error: err instanceof Error ? err : new Error(String(err)),
      isRefreshing: false,
      settled: true,
    });
    schedule(Math.min(interval * 2 ** channel.failures, MAX_BACKOFF_MS));
  }
}

/** Poll now if the data is older than the wanted interval, else when it will be. */
function reschedule() {
  const interval = wantedInterval();
  if (interval === null) {
    clearTimer();
    channel.abort?.abort();
    return;
  }
  if (channel.state.isRefreshing) return;
  const age = channel.state.lastUpdated ? Date.now() - channel.state.lastUpdated.getTime() : Infinity;
  schedule(channel.failures ? Math.min(interval * 2 ** channel.failures, MAX_BACKOFF_MS) - age : interval - age);
}

function bindVisibility() {
  if (channel.visibilityBound) return;
  channel.visibilityBound = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !channel.subscribers.size) return;
    channel.failures = 0;
    clearTimer();
    void poll();
  });
}

function register(intervalMs: number, background: boolean): () => void {
  const id = channel.nextId++;
  channel.subscribers.set(id, { interval: intervalMs, background });
  bindVisibility();
  reschedule();
  return () => {
    channel.subscribers.delete(id);
    reschedule();
  };
}

const subscribeState = (listener: () => void) => {
  channel.listeners.add(listener);
  return () => channel.listeners.delete(listener);
};
const getState = () => channel.state;
const getServerState = () => SERVER_STATE;

export function refreshMatches(): void {
  channel.failures = 0;
  clearTimer();
  void poll();
}

/**
 * Subscribe to the shared crex match list.
 *
 *   - Pauses while the tab is hidden (unless a `background` subscriber needs it),
 *     and polls immediately on return.
 *   - Backs off exponentially on failure.
 *   - Keeps the last good data on error — a failed poll shows stale scores,
 *     never an empty list.
 *   - A subscriber that stops polling keeps the last list it saw, rather than
 *     falling back to its seed.
 */
export function useCrexMatches(options: UseCrexMatchesOptions = {}): UseCrexMatchesResult {
  const { initial = [], intervalMs = DEFAULT_INTERVAL_MS, enabled = true, background = false } = options;
  const snapshot = useSyncExternalStore(subscribeState, getState, getServerState);

  useEffect(() => {
    if (!enabled) return;
    return register(intervalMs, background);
  }, [enabled, intervalMs, background]);

  const lastSeen = useRef<Match[] | null>(null);
  const live = enabled && snapshot.lastUpdated ? snapshot.matches : null;
  if (live) lastSeen.current = live;

  const refresh = useCallback(() => refreshMatches(), []);

  return {
    matches: live ?? lastSeen.current ?? initial,
    isLoading: enabled && !snapshot.settled && initial.length === 0,
    isRefreshing: enabled && snapshot.isRefreshing,
    error: enabled ? snapshot.error : null,
    lastUpdated: lastSeen.current ? snapshot.lastUpdated : null,
    refresh,
  };
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
  /** When the ball feed last arrived — the clock a stale-stoppage check reads. */
  fetchedAt: number | null;
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
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);

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
        setFetchedAt(Date.now());
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

  return { innings, commentary, events, overs, loaded, fetchedAt };
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
