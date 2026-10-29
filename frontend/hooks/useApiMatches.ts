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
  FeedNote,
  SquadPlayer,
} from '@/types';
import {
  clearResumedStoppages,
  feedFromRows,
  getApiMatches,
  getApiMatchFeed,
  getApiInningsFeed,
  getApiMatchInfo,
  getApiScorecard,
  matchListFromRaw,
  scorecardFromRaw,
} from '@/lib/api';
import type { ApiFeedRow, ApiMatchFeed, ApiMatchesResponse, ApiScorecardBody, StoppageWatch } from '@/lib/api';
import { keepNewest } from '@/lib/liveScore';
import { dedupeDeliveries } from '@/lib/balls';
import {
  applyMatchesFrame,
  mergeFeedItems,
  reuseUnchanged,
  sameItems,
  type FrameVerdict,
  type LiveFrame,
} from '@/lib/live/frames';
import { isTopicLive, onLiveChange, onLiveResync, subscribeLive } from '@/lib/live/socket';

// The Worker's live socket pushes changes when it is up (lib/live/socket). The
// poll stays underneath it: every 2s without the socket — matched to the
// Worker's edge TTL on /matches/live — and only as a rare safety net with it.
const DEFAULT_INTERVAL_MS = 2_000;

/**
 * Poll cadence while the socket is delivering. Missed list frames already trigger a
 * re-read (`gap`), and a reconnect resyncs; this only catches a topic the hub has
 * silently stopped refreshing.
 */
const RECONCILE_MS = 5 * 60_000;

// Components mounting together on one page share a single entry revalidation.
const ENTRY_DEDUPE_MS = 1_000;

/** Enough history for the strips and the momentum walk; MatchDetail merges deeper history itself. */
const FEED_CAP = { balls: 360, events: 120, overs: 60, notes: 160 };

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

/** A poll's cadence: with the socket delivering it is only a check, no faster than the reconcile rate. */
const cadence = (every: number, socketLive: boolean): number => (socketLive ? Math.max(every, RECONCILE_MS) : every);

/** The wait after `failures` failed polls in a row: doubling, capped. */
const backoff = (every: number, failures: number): number =>
  failures ? Math.min(every * 2 ** failures, MAX_BACKOFF_MS) : every;

export interface UseApiMatchesResult {
  matches: Match[];
  /** True only during the very first load, so callers can skip a flash of empty. */
  isLoading: boolean;
  /** True while a poll retries after an error — what a Retry button spins on. */
  isRefreshing: boolean;
  error: Error | null;
  /** When the last successful poll landed. */
  lastUpdated: Date | null;
  /** Force a poll now — resets any backoff. */
  refresh: () => void;
}

export interface UseApiMatchesOptions {
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
  // A poll is running. Kept off the published state so a routine poll doesn't re-render every
  // subscriber; `isRefreshing` is only published while an error shows (the retry spinner).
  inFlight: false,
  // What each match's reported break looked like last poll — see `clearResumedStoppages`.
  stoppages: new Map<string, StoppageWatch>(),
  visibilityBound: false,
  /** The last /matches/live body, poll's or socket's — the base socket diffs apply to. */
  raw: null as ApiMatchesResponse | null,
  deriving: 0,
  lastPollAt: 0,
  entryTimer: null as ReturnType<typeof setTimeout> | null,
  unsubscribeLive: null as (() => void) | null,
};

function emit(patch: Partial<ChannelState>) {
  channel.state = { ...channel.state, ...patch };
  channel.listeners.forEach((l) => l());
}

const isHidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';

function wantedInterval(): number | null {
  const subs = [...channel.subscribers.values()];
  if (!isHidden()) {
    if (!subs.length) return null;
    const fastest = Math.min(...subs.map((s) => s.interval));
    return cadence(fastest, isTopicLive('matches'));
  }
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
  channel.lastPollAt = Date.now();
  channel.inFlight = true;
  if (channel.state.error) emit({ isRefreshing: true });

  try {
    const raw = await getApiMatches({ signal: controller.signal });
    const next = await matchListFromRaw(raw, { signal: controller.signal });
    if (controller.signal.aborted) return;

    channel.raw = raw;
    channel.deriving += 1;
    channel.failures = 0;
    channel.inFlight = false;
    land(next, { isRefreshing: false });
    schedule(wantedInterval() ?? interval);
  } catch (err) {
    if (controller.signal.aborted) return;
    channel.inFlight = false;
    channel.failures += 1;
    emit({
      error: err instanceof Error ? err : new Error(String(err)),
      isRefreshing: false,
      settled: true,
    });
    schedule(backoff(interval, channel.failures));
  }
}

/**
 * A fresh list from either source; one that went backwards keeps the newer copy, and an
 * unchanged match keeps its object, so most polls leave every memo keyed on it alone.
 */
function land(next: Match[], patch: Partial<ChannelState> = {}) {
  const landed = new Date();
  const prev = channel.state.matches;
  emit({
    matches: reuseUnchanged(prev, clearResumedStoppages(keepNewest(prev, next), channel.stoppages, landed.getTime())),
    lastUpdated: landed,
    error: null,
    settled: true,
    ...patch,
  });
}

function onMatchesFrame(frame: LiveFrame, verdict: FrameVerdict) {
  const raw = applyMatchesFrame(channel.raw, frame);
  // A diff with nothing to apply it to, or after a missed one: the API has the whole list.
  if (!raw || verdict === 'gap') refreshMatches();
  if (!raw) return;
  channel.raw = raw;
  const run = ++channel.deriving;
  matchListFromRaw(raw)
    .then((next) => {
      // A later frame or poll already started; it lands instead.
      if (run === channel.deriving) land(next);
    })
    .catch(() => undefined);
}

/** Poll now if the data is older than the wanted interval, else when it will be. */
function reschedule() {
  const interval = wantedInterval();
  if (interval === null) {
    clearTimer();
    // An aborted poll never reaches the line that clears the flag, and a flag
    // left set would stop the next page's poll from ever starting.
    channel.abort?.abort();
    channel.abort = null;
    channel.inFlight = false;
    if (channel.state.isRefreshing) emit({ isRefreshing: false });
    return;
  }
  if (channel.inFlight) return;
  const age = channel.state.lastUpdated ? Date.now() - channel.state.lastUpdated.getTime() : Infinity;
  schedule(backoff(interval, channel.failures) - age);
}

function bindVisibility() {
  if (channel.visibilityBound) return;
  channel.visibilityBound = true;
  // Nothing proves a hidden tab got every frame, so coming back reconciles with the API.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !channel.subscribers.size) return;
    channel.failures = 0;
    clearTimer();
    void poll();
  });
  onLiveChange(() => {
    if (channel.subscribers.size) reschedule();
  });
  onLiveResync(() => {
    if (channel.subscribers.size) refreshMatches();
  });
}

/**
 * A page that shows the list asks the API when it opens, unless the socket is
 * already delivering it: the cached list renders at once and the answer
 * replaces it. Everything mounting in the same pass shares one request.
 */
function revalidateOnEntry() {
  if (channel.entryTimer) return;
  channel.entryTimer = setTimeout(() => {
    channel.entryTimer = null;
    if (!channel.subscribers.size || channel.inFlight || isTopicLive('matches')) return;
    if (Date.now() - channel.lastPollAt < ENTRY_DEDUPE_MS) return;
    refreshMatches();
  }, 0);
}

function register(intervalMs: number, background: boolean): () => void {
  const id = channel.nextId++;
  channel.subscribers.set(id, { interval: intervalMs, background });
  bindVisibility();
  if (!channel.unsubscribeLive) channel.unsubscribeLive = subscribeLive('matches', onMatchesFrame);
  reschedule();
  revalidateOnEntry();
  return () => {
    channel.subscribers.delete(id);
    if (!channel.subscribers.size && channel.unsubscribeLive) {
      channel.unsubscribeLive();
      channel.unsubscribeLive = null;
    }
    reschedule();
  };
}

const subscribeState = (listener: () => void) => {
  channel.listeners.add(listener);
  return () => channel.listeners.delete(listener);
};
const getState = () => channel.state;
const getServerState = () => SERVER_STATE;

function refreshMatches(): void {
  channel.failures = 0;
  clearTimer();
  void poll();
}

/**
 * Subscribe to the shared upstream match list.
 *
 *   - Pauses while the tab is hidden (unless a `background` subscriber needs it),
 *     and polls immediately on return.
 *   - Backs off exponentially on failure.
 *   - Keeps the last good data on error — a failed poll shows stale scores,
 *     never an empty list.
 *   - A subscriber that stops polling keeps the last list it saw, rather than
 *     falling back to its seed.
 */
export function useApiMatches(options: UseApiMatchesOptions = {}): UseApiMatchesResult {
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

export interface UseApiMatchResult extends Omit<UseApiMatchesResult, 'matches'> {
  /** Null once polling has run and the id is no longer in the upstream's window. */
  match: Match | null;
}

/**
 * Track one match by the upstream key.
 *
 * Deliberately built on the same list poll rather than a per-match endpoint:
 * `/matches/live` carries every match the upstream knows about, so the detail page
 * shares the Worker's cache entry with the home page instead of adding a second
 * upstream call per viewer.
 */
export function useApiMatch(
  id: string,
  options: { initial?: Match | null; intervalMs?: number; enabled?: boolean } = {}
): UseApiMatchResult {
  const { initial = null, intervalMs, enabled } = options;

  const { matches, ...rest } = useApiMatches({
    initial: initial ? [initial] : [],
    intervalMs,
    enabled,
  });

  // Before the first poll lands, `matches` is just the seed — trust `initial`.
  // After it lands, a missing id means the upstream has aged the match out; keep
  // showing the last known state rather than blanking the page.
  const found = matches.find((m) => m.id === id) ?? null;

  return { ...rest, match: found ?? initial };
}

export interface UseApiMatchExtrasResult {
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
  /** Notes, stat cards and reviews from the same feed. */
  notes: FeedNote[];
  loaded: boolean;
  /** When the ball feed last arrived — the clock a stale-stoppage check reads. */
  fetchedAt: number | null;
}

/**
 * Poll an upstream match's scorecard and commentary.
 *
 * Kept separate from `useApiMatch` because these are two extra round trips per
 * tick and only the detail page needs them — the home page must not pay for
 * them. Both are fetched together so the card and the ball-by-ball never show
 * different moments of the same over.
 *
 * Failures are swallowed on purpose: the detail page is still perfectly usable
 * with the header score alone, and a blank tab beats an error banner.
 */
export function useApiMatchExtras(
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
    /** Lets the card mark the innings in progress — see `getApiScorecard`. */
    status?: MatchStatus;
  } = {}
): UseApiMatchExtrasResult {
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
  const [notes, setNotes] = useState<FeedNote[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);

  const active = enabled && Boolean(matchKey);
  const inningsRef = useRef<InningsScore[]>([]);
  const keyRef = useRef(matchKey);
  // The newest feed row held: later polls read only the tail down to it, not three overs again.
  const newestRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) return;
    // Held items are merged into, so another match's must not carry over.
    if (keyRef.current !== matchKey) {
      keyRef.current = matchKey;
      inningsRef.current = [];
      newestRef.current = null;
      setInnings([]);
      setCommentary([]);
      setEvents([]);
      setOvers([]);
      setNotes([]);
      setLoaded(false);
      setFetchedAt(null);
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let failures = 0;
    const controller = new AbortController();
    const cardTopic = `card:${matchKey}`;
    const feedTopic = `feed:${matchKey}`;
    const socketLive = () => isTopicLive(cardTopic) && isTopicLive(feedTopic);
    let wasLive = false;

    const clear = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };

    // A card from a cache a few seconds behind must not undo one already shown, and an
    // identical one is not news.
    const takeCard = (card: InningsScore[]) => {
      if (!card.length || cardProgress(card) < cardProgress(inningsRef.current)) return;
      if (JSON.stringify(card) === JSON.stringify(inningsRef.current)) return;
      inningsRef.current = card;
      setInnings(card);
    };
    const takeFeed = (feed: Pick<ApiMatchFeed, 'balls' | 'events' | 'overs' | 'notes'>) => {
      setCommentary((prev) => merged(prev, dedupeDeliveries(mergeFeedItems(prev, feed.balls, FEED_CAP.balls))));
      setEvents((prev) => merged(prev, mergeFeedItems(prev, feed.events, FEED_CAP.events)));
      setOvers((prev) => merged(prev, mergeFeedItems(prev, feed.overs, FEED_CAP.overs)));
      setNotes((prev) => merged(prev, mergeFeedItems(prev, feed.notes, FEED_CAP.notes)));
      // Still set when nothing changed: it is the clock a stale-stoppage check reads.
      setFetchedAt(Date.now());
    };

    async function run(): Promise<void> {
      clear();
      // Same as the list poll: park the chain rather than re-arm a throttled
      // timer, and let the visibility listener below resume it.
      if (isHidden()) return;

      const [card, feed] = await Promise.all([
        getApiScorecard(matchKey, {
          signal: controller.signal,
          ballsPerOver,
          status,
        }).catch(() => null),
        // One walk of the ball feed for both halves, so the events strip and the
        // commentary can never show different moments of the same over.
        getApiMatchFeed(matchKey, { signal: controller.signal, since: newestRef.current }).catch(() => null),
      ]);

      if (cancelled || controller.signal.aborted) return;

      // Only overwrite on success — a failed poll keeps the last good card
      // rather than emptying the tab.
      if (card) takeCard(card);
      if (feed) {
        takeFeed(feed);
        if (feed.newest !== null) newestRef.current = Math.max(newestRef.current ?? 0, feed.newest);
      }
      if (card || feed) setLoaded(true);

      // Both halves failing is the signal to slow down — the same exponential
      // back-off `useApiMatches` uses, and for the same reason: a struggling
      // Worker should not be asked twice a second while it recovers.
      failures = card || feed ? 0 : failures + 1;

      if (!repeat) return;
      timer = setTimeout(run, backoff(cadence(intervalMs, socketLive()), failures));
    }

    void run();

    const onVisible = () => {
      if (repeat && document.visibilityState === 'visible') void run();
    };
    document.addEventListener('visibilitychange', onVisible);

    // A finished match's card is final; only a live one is worth a socket topic.
    const offLive = repeat
      ? [
          subscribeLive(cardTopic, (frame) => {
            scorecardFromRaw(frame.data as ApiScorecardBody, { ballsPerOver, status })
              .then((card) => {
                if (cancelled) return;
                takeCard(card);
                setLoaded(true);
              })
              .catch(() => undefined);
          }),
          subscribeLive(feedTopic, (frame) => {
            if (!Array.isArray(frame.data)) return;
            takeFeed(feedFromRows(frame.data as ApiFeedRow[]));
            setLoaded(true);
          }),
          onLiveResync(() => void run()),
          onLiveChange(() => {
            const now = socketLive();
            if (now !== wasLive && timer) {
              // Losing the socket puts the fast poll straight back; gaining it slows the poll to a check.
              clear();
              timer = now ? setTimeout(run, cadence(intervalMs, true)) : null;
              if (!now) void run();
            }
            wasLive = now;
          }),
        ]
      : [];

    return () => {
      cancelled = true;
      controller.abort();
      clear();
      document.removeEventListener('visibilitychange', onVisible);
      offLive.forEach((off) => off());
    };
  }, [active, matchKey, intervalMs, repeat, ballsPerOver, status]);

  return { innings, commentary, events, overs, notes, loaded, fetchedAt };
}

/** The held list when a merge changed nothing, so the state setter bails out. */
const merged = <T,>(prev: T[], next: T[]): T[] => (sameItems(prev, next) ? prev : next);

/** How far a card has got, so a stale one can be recognised: balls bowled, then runs. */
function cardProgress(card: InningsScore[]): number {
  return card.reduce((n, i) => n + (i.notStarted ? 0 : Math.round(i.overs * 10) * 1_000 + i.runs), 0);
}

export interface UseApiCommentaryHistoryResult {
  balls: CommentaryBall[];
  overs: OverSummary[];
  notes: FeedNote[];
  /** Milestones and wickets that have scrolled out of the live poll's page. */
  events: MatchEvent[];
  /** A read is in flight — the first one, or a "load older". */
  loading: boolean;
  /** Every innings back to the first is held. */
  exhausted: boolean;
  /** Read the innings before the oldest held. No-op while one is running, or once exhausted. */
  loadMore: () => void;
}

/**
 * Deliveries the live poll never reaches: its walk stops at three overs. Reads the innings in play
 * whole (one request, `getApiInningsFeed`) when the tab opens and each earlier one on "load older";
 * the caller merges the live tail in by id.
 */
export function useApiCommentaryHistory(
  matchKey: string,
  options: { enabled?: boolean; inning: number | null }
): UseApiCommentaryHistoryResult {
  const { enabled = true, inning } = options;

  const [balls, setBalls] = useState<CommentaryBall[]>([]);
  const [overs, setOvers] = useState<OverSummary[]>([]);
  const [notes, setNotes] = useState<FeedNote[]>([]);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  // The innings the next read asks for; null until the first one has landed.
  const next = useRef<number | null>(null);
  // Guards the first read against an effect that re-runs, and both against a
  // second one starting while the first is still out.
  const inFlight = useRef(false);
  const started = useRef('');

  const read = useCallback(
    async (target: number) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setLoading(true);
      // A read still out when the page moves to another match must not land on it.
      const current = () => started.current === matchKey;

      try {
        const feed = await getApiInningsFeed(matchKey, target);
        if (!current()) return;
        setBalls((prev) => mergeFeedItems(prev, feed.balls, Infinity));
        setOvers((prev) => mergeFeedItems(prev, feed.overs, Infinity));
        setNotes((prev) => mergeFeedItems(prev, feed.notes, Infinity));
        setEvents((prev) => mergeFeedItems(prev, feed.events, Infinity));
        // A Worker without the innings filter sends the whole match, first innings included.
        const reachedFirst = target <= 0 || feed.balls.some((b) => b.inning === 0);
        next.current = target - 1;
        if (reachedFirst) setExhausted(true);
      } catch {
        // A failed read leaves what is already held; the reader can ask again.
      } finally {
        if (current()) {
          inFlight.current = false;
          setLoading(false);
        }
      }
    },
    [matchKey]
  );

  useEffect(() => {
    if (!enabled || !matchKey || inning === null || started.current === matchKey) return;
    if (started.current) {
      setBalls([]);
      setOvers([]);
      setNotes([]);
      setEvents([]);
      setExhausted(false);
      inFlight.current = false;
    }
    next.current = null;
    started.current = matchKey;
    void read(inning);
  }, [enabled, matchKey, inning, read]);

  const loadMore = useCallback(() => {
    if (exhausted || inFlight.current || started.current !== matchKey) return;
    // Nothing landed yet: the first read failed, so ask for it again.
    const target = next.current ?? inning;
    if (target !== null && target >= 0) void read(target);
  }, [exhausted, read, inning, matchKey]);

  return { balls, overs, notes, events, loading, exhausted, loadMore };
}

/**
 * Both squads for a match, keyed by team f_key.
 *
 * Fetched once rather than polled, and kept out of `useApiMatchExtras` for the
 * same reason: a squad is announced, not scored. It changes when a team names
 * its XI — a day or two before the toss — and never once play starts, so
 * putting it on the 5s tick would be a third round trip every poll for a list
 * that is identical every time.
 *
 * Failures are swallowed, like the extras above: no squad simply means the
 * squad section is not shown.
 */
export function useApiMatchSquads(
  matchKey: string,
  options: { enabled?: boolean } = {}
): {
  squads: Record<string, SquadPlayer[]>;
  /** Squad players left out of each named XI. */
  bench: Record<string, SquadPlayer[]>;
  /** The forecast, the officials, the broadcasters and the ground's record. */
  conditions: MatchConditions | null;
  loaded: boolean;
} {
  const { enabled = true } = options;

  const [squads, setSquads] = useState<Record<string, SquadPlayer[]>>({});
  const [bench, setBench] = useState<Record<string, SquadPlayer[]>>({});
  const [conditions, setConditions] = useState<MatchConditions | null>(null);
  const [loaded, setLoaded] = useState(false);
  const keyRef = useRef(matchKey);

  useEffect(() => {
    if (!enabled || !matchKey) return;
    if (keyRef.current !== matchKey) {
      keyRef.current = matchKey;
      setSquads({});
      setBench({});
      setConditions(null);
      setLoaded(false);
    }

    let cancelled = false;
    const controller = new AbortController();

    getApiMatchInfo(matchKey, { signal: controller.signal })
      .then((next) => {
        if (cancelled || controller.signal.aborted) return;
        setSquads(next.squads);
        setBench(next.bench);
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

  return { squads, bench, conditions, loaded };
}
