// Client for the Cloudflare Worker that fronts crex.com (see /worker-crex).
//
// Sibling of cricketLive.ts, but crex needs a lot more translation. Two things
// make this module bigger than a fetch wrapper:
//
//   1. The wire format is obfuscated. Every field is one or two letters — `b`
//      and `c` are the two teams, `j` and `k` their scores, `q` the series,
//      `v` the venue, `ti` the start time. Decoding lives in `toMatch`.
//   2. Teams, venues and series arrive as opaque keys ("11", "BK", "^1JK"),
//      not names. Resolving them takes a second call to /mapping, so this
//      module keeps a process-level cache of keys it has already looked up and
//      only asks for the ones it hasn't seen.
//
// Nothing here talks to our own backend — that is api.ts. This is a parallel,
// optional source, so every export is written to fail soft: callers should be
// able to lose crex entirely and still render.

import type {
  BallExtra,
  BatsmanLine,
  BowlerLine,
  CommentaryBall,
  ExtrasBreakdown,
  InningsPhase,
  InningsScore,
  Match,
  MatchEvent,
  MatchEventKind,
  MatchFormat,
  MatchNote,
  MatchNoteKind,
  MatchSquads,
  MatchStatus,
  PlayerBattingCareer,
  PlayerBowlingCareer,
  PlayerDebut,
  PlayerFormEntry,
  PlayerOfMatch,
  PlayerProfile,
  PlayerRanking,
  PlayerRole,
  PlayerRoleLabel,
  PointsTableGroup,
  PointsTableRow,
  RankingFormat,
  RankingGender,
  RetirementKind,
  SeriesBattingTotals,
  SeriesBowlingTotals,
  SeriesLeader,
  SeriesLeaderKind,
  SeriesLeaders,
  SeriesStatKind,
  SeriesStatRow,
  SeriesStatTable,
  SeriesSummary,
  SquadPlayer,
  Team,
  TeamColors,
  TeamProfile,
  TeamRankingPosition,
  HeadToHeadMatch,
} from '@/types';
import {
  DEFAULT_BALLS_PER_OVER,
  HUNDRED_BALLS_PER_OVER,
  SCHEDULED_OVERS,
  ballsFrom,
  oversFrom,
} from './overs';

// The home page has no other source now, so this falls back to the deployed
// Worker rather than to '' — an unset env var used to mean "no crex", which now
// means "no matches at all". Override it to point at a local `wrangler dev`.
const DEFAULT_WORKER_URL = 'https://pulsecrease-crex.pulse-cricket.workers.dev';

const CREX_WORKER_URL = process.env.NEXT_PUBLIC_CREX_WORKER_URL ?? DEFAULT_WORKER_URL;

/** crex serves team badges off Akamai, keyed by the same f_key as the match. */
const TEAM_LOGO_BASE = 'https://cricketvectors.akamaized.net/Teams';

// ---------------------------------------------------------------------------
// Wire format
// ---------------------------------------------------------------------------

/**
 * One match as crex sends it. Field names are theirs; comments are what each
 * one turned out to mean when checked against live data.
 *
 * Only the fields we actually read are typed. The payload carries ~15 more
 * (odds, promo flags, YouTube metadata) that are deliberately left alone.
 */
export interface CrexRawMatch {
  /**
   * Status code, and the only structured source for breaks and interruptions.
   * Three forms, all decoded by `decodeMatchNote`:
   *
   *   "$a".."$x"  a status from crex's own table — Drinks Break, Stumps, Rain
   *               Delay, Abandoned. The reliable form.
   *   "^0".."^3"  the toss: who won it and what they chose.
   *   "&…"        crex-compressed result text. Not decoded — `res` carries the
   *               same thing in plain English.
   *
   * Older payloads send the bare letter ("l" for Stumps) rather than "$l", so
   * both spellings are read.
   */
  a?: string;
  /** Qualifier on the status, e.g. "(wet outfield)". */
  ac?: string;
  /** Team 1 key. Resolve via /mapping `t`. */
  b: string;
  /** Team 2 key. */
  c: string;
  /** Match number within the series, e.g. "126". */
  e?: string;
  /** Format label: "ODI" | "Test" | "T20" | "List A" | "One Day". */
  fo?: string;
  /**
   * Hundred-ball flag. crex omits `fo` entirely on The Hundred and sets this
   * instead, so without it those matches fall through to the ODI default.
   */
  hb?: number;
  /**
   * The four innings slots, by side rather than by chronology:
   *
   *   j  team 1's first innings, "282/6(50.0" — note the unclosed paren
   *   k  team 2's first innings
   *   l  team 1's second innings   } Tests only; absent on the single-innings
   *   m  team 2's second innings   } formats
   *
   * Verified against /match/scorecard, whose innings carry an explicit batting
   * team: the card's four innings line up with j, k, l, m in that order on every
   * match in the feed, Tests included. A "!" in front of the runs marks a
   * declaration.
   */
  j?: string;
  /** Team 2's first innings. */
  k?: string;
  /** Team 1's second innings — Tests only. */
  l?: string;
  /** Team 2's second innings — Tests only. */
  m?: string;
  /**
   * Which innings is in progress. 1 or 2 means the sides are on their first
   * innings, 3–6 their second; odd means team 1 is the side batting, even team 2.
   * crex derives its whole header from this pairing, and it holds on all eight
   * matches checked against the scorecard endpoint.
   */
  d?: number;
  /** Series key, usually "^"-prefixed. */
  q: string;
  /** Human-readable status/result: "Innings Break", "UAE won by 97 runs". */
  res?: string;
  /** Start time, epoch ms. Occasionally a countdown string ("02h : 23m"). */
  ti: number | string;
  /** Venue key. Resolve via /mapping `v`. */
  v: string;
  /**
   * Set once the match is over and never unset. Only consulted when `n` is
   * missing: crex's own site ignores this field entirely and switches on `n`,
   * and the two never disagreed across a full feed.
   */
  finishTime?: number;
  /**
   * Packed state: format in `n % 4`, live/upcoming/finished in `(n % 12) / 4`
   * and the day of play in `n / 12`. Read it through `decodeMatchState` — it is
   * NOT a threshold, and treating it as one reports a Test in progress as
   * finished from its second day on.
   */
  n?: number;
  /**
   * Player of the match, dot-packed and set only once the match is over:
   *
   *   "CO.1GK.65(36).3/30"
   *    |  |    |       bowling figures
   *    |  |    batting figures, "*" if unbeaten
   *    |  the side they played for, a team key
   *    player key, resolved through /mapping
   *
   * A specialist has only one of the two figures; the other arrives as the
   * literal "-^-", which `decodePlayerOfMatch` reads as absent.
   */
  mm?: string;
  /**
   * Set on well over half the list, live Tests and CPL fixtures included — so
   * whatever it gates on crex.com, it is NOT "don't show this match". Typed only
   * to record that: do not filter on it. Use `isRenderableMatch` instead.
   */
  hide?: number;
}

/**
 * crex mixes stub entries into the match list — objects carrying a `wp` field
 * and nothing else: no teams, no series, no venue, no start time. They are not
 * fixtures, and `toMatch` cannot tell, because every one of its fallbacks fires
 * at once ('' for a team, 'Cricket' for the series, 'TBD' for the venue, and
 * *now* for the missing `ti`) and produces a blank card dated today.
 *
 * The two team keys are the test: a real fixture always names both sides, even
 * when everything else about it is still unannounced.
 */
export function isRenderableMatch(m: CrexRawMatch): boolean {
  return Boolean(cleanKey(m.b) && cleanKey(m.c));
}

/** /matches/live returns an object keyed by match id, not an array. */
export type CrexMatchesResponse = Record<string, CrexRawMatch>;

interface CrexMapEntry {
  f_key: string;
  /** Full name. */
  n: string;
  /** Short name — teams only. */
  sn?: string;
  /**
   * Club colours — teams only, and the reason a team page can look like that
   * team. `cc` arrives as "0-#8F65E6": a mode flag, a dash, and the hex. `uc`
   * and `dc` are plain hex. crex uses them for their own team crest chips.
   */
  cc?: string;
  uc?: string;
  dc?: string;
}

export interface CrexMapping {
  t?: CrexMapEntry[]; // teams
  v?: CrexMapEntry[]; // venues
  s?: CrexMapEntry[]; // series
  p?: CrexMapEntry[]; // players
  u?: CrexMapEntry[]; // umpires
}

export type CrexMapKind = 't' | 'v' | 's' | 'p';

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

interface FetchOpts {
  /** Next.js revalidate window, in seconds. Ignored in the browser. */
  revalidate?: number;
  signal?: AbortSignal;
}

/**
 * crex counts balls, not overs, everywhere on the wire — six per over, except on
 * The Hundred, where their own scorecard divides by five. Nothing in the
 * scorecard payload says which, so the caller passes it down from the match.
 * Over notation itself lives in lib/overs.
 */

/** An innings of The Hundred, in balls. */
const HUNDRED_BALLS = 100;

async function crexGet<T>(path: string, opts: FetchOpts = {}): Promise<T> {
  const res = await fetch(`${CREX_WORKER_URL.replace(/\/$/, '')}${path}`, {
    headers: { Accept: 'application/json' },
    signal: opts.signal,
    next: opts.revalidate !== undefined ? { revalidate: opts.revalidate } : undefined,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw Object.assign(new Error(`crex ${path} failed: ${res.status} ${detail.slice(0, 200)}`), {
      status: res.status,
    });
  }

  return (await res.json()) as T;
}

/** Every match crex knows about — live, upcoming and recently finished. */
export function getCrexMatches(opts: FetchOpts = {}): Promise<CrexMatchesResponse> {
  return crexGet<CrexMatchesResponse>('/matches/live', { revalidate: 15, ...opts });
}

/** One row of an ICC ranking list. Keys resolve through /mapping. */
export interface CrexRankingRow {
  /** Rating. */
  r: number;
  /** Team f_key. */
  tf: string;
  /** Player f_key. */
  pf: string;
  /** Previous position — crex draws its up/down arrow from this. */
  pr: number;
  /** Current position. */
  pos: number;
}

/**
 * One ICC player-ranking list: a single format × gender × discipline.
 *
 * crex's own vocabulary, deliberately — `type` is the format and `play` the
 * discipline. See the /rankings/players note in the Worker's routes.ts for why
 * these names are not the ones you would guess.
 */
export function getCrexRankingList(
  params: { type: 'test' | 'odi' | 't20'; gender: 'men' | 'women'; play: 'batting' | 'bowling' | 'allrounder' },
  opts: FetchOpts = {}
): Promise<CrexRankingRow[]> {
  const qs = new URLSearchParams({ category: 'player', ...params });
  return crexGet<CrexRankingRow[]>(`/rankings/players?${qs}`, { revalidate: 3600, ...opts });
}

/** One row of an ICC *team* ranking list. `tf` resolves through /mapping. */
export interface CrexTeamRankingRow {
  /** Rating — points / matches, rounded the way the ICC publishes it. */
  r: number;
  /** Total rating points. */
  p: number;
  /** Matches counted in the rating period. */
  m: number;
  /** Team f_key. */
  tf: string;
}

/** crex's own format keys on the team-rankings response. Note t20, not t20i. */
export type CrexTeamRankingsResponse = Partial<
  Record<'test' | 'odi' | 't20', CrexTeamRankingRow[]>
>;

/**
 * Team rankings for one gender — all three formats in a single response.
 *
 * This is the Worker's `/rankings` (crex's rankingFront), NOT the string-param
 * `/rankings/players` route with `category=team`. Both exist and this one is
 * strictly better here: it returns every format at once, so the whole page costs
 * two calls rather than six, and `category=team&type=t20&gender=women` on the
 * other route comes back empty while this one has the list. `category` is passed
 * only because the route requires it — the reply ignores it and sends all three.
 */
export function getCrexTeamRankings(
  gender: 'men' | 'women',
  opts: FetchOpts = {}
): Promise<CrexTeamRankingsResponse> {
  const qs = new URLSearchParams({
    category: '0',
    gender: gender === 'women' ? '1' : '0',
    play: '0',
  });
  return crexGet<CrexTeamRankingsResponse>(`/rankings?${qs}`, { revalidate: 3600, ...opts });
}

/** Crest URL for a team f_key, or null when there is no key to build one from. */
export function teamLogoUrl(key: string | undefined): string | null {
  const clean = cleanKey(key);
  return clean ? `${TEAM_LOGO_BASE}/${clean}.png` : null;
}

/**
 * Resolve keys to names. Buckets are comma-separated; empty ones are omitted so
 * the Worker's cache key stays as small as possible.
 */
export function getCrexMapping(
  keys: Partial<Record<CrexMapKind, string[]>>,
  opts: FetchOpts = {}
): Promise<CrexMapping> {
  const qs = new URLSearchParams();
  for (const [kind, list] of Object.entries(keys)) {
    if (list?.length) qs.set(kind, [...new Set(list)].sort().join(','));
  }
  if (![...qs.keys()].length) return Promise.resolve({});

  return crexGet<CrexMapping>(`/mapping?${qs}`, { revalidate: 21600, ...opts });
}

// ---------------------------------------------------------------------------
// Key resolution
// ---------------------------------------------------------------------------

/**
 * Names are effectively immutable once resolved — a team key means the same
 * thing tomorrow — so a poll only ever asks for keys it has not seen before.
 * On a steady-state home page that means zero mapping requests after the first.
 */
const nameCache: Record<CrexMapKind, Map<string, CrexMapEntry>> = {
  t: new Map(),
  v: new Map(),
  s: new Map(),
  p: new Map(),
};

/**
 * Ceiling on each bucket.
 *
 * This cache is process-global and, on a server, lives as long as the process
 * does — so "names are immutable, keep them all" was a slow leak rather than an
 * optimisation. Teams, venues and series are naturally bounded (crex has a few
 * thousand of each, and a deployment sees a fraction). Players are not: every
 * scorecard, every ranking list and every squad names more of them, and nothing
 * ever released one.
 *
 * The limits are set well above a realistic working set, so eviction should be
 * a backstop rather than something the app runs into.
 */
const CACHE_LIMIT: Record<CrexMapKind, number> = {
  t: 4_000,
  v: 4_000,
  s: 4_000,
  p: 20_000,
};

/**
 * Write a resolved name, evicting the oldest if the bucket is full.
 *
 * A Map iterates in insertion order, so re-inserting on write puts the freshest
 * key at the back and makes the front the least recently *written*. Not true
 * LRU — a key read a thousand times and never rewritten still ages out — which
 * is the right trade here: entries are cheap to re-fetch and the limit is high
 * enough that eviction is rare.
 */
function remember(kind: CrexMapKind, entry: CrexMapEntry): void {
  const bucket = nameCache[kind];
  bucket.delete(entry.f_key);
  bucket.set(entry.f_key, entry);

  const excess = bucket.size - CACHE_LIMIT[kind];
  if (excess <= 0) return;

  const oldest = bucket.keys();
  for (let i = 0; i < excess; i++) {
    const key = oldest.next();
    if (key.done) break;
    bucket.delete(key.value);
  }
}

/**
 * Keys with a /mapping request already open, so concurrent callers share it.
 *
 * Without this, the cache only collapsed requests that had already *landed*.
 * A home page and a match page rendering in the same tick — or several server
 * requests arriving together — each saw an empty cache, and each asked for the
 * same few hundred keys. The promise is registered before it is awaited, so the
 * second caller finds it and waits rather than issuing its own.
 */
const inFlight = new Map<string, Promise<void>>();

const flightKey = (kind: CrexMapKind, key: string): string => `${kind}:${key}`;

/** crex prefixes some keys with "^" on the match object but not in the map. */
const cleanKey = (key: string | undefined): string => (key ?? '').replace(/^\^/, '');

/** The Worker caps /mapping at 200 keys per bucket, so ask in batches. */
const MAPPING_BATCH = 200;

/**
 * Fetch whatever keys are not cached yet, then return the whole cache.
 *
 * The single door into `nameCache`: hand it the keys a payload referenced, in
 * whatever buckets, and it asks for only the ones it has not seen. Requests are
 * split into batches because the Worker caps /mapping at 200 keys per bucket.
 */
export async function resolveKeys(
  wanted: Partial<Record<CrexMapKind, Iterable<string>>>,
  opts: FetchOpts = {}
): Promise<typeof nameCache> {
  const missing: Partial<Record<CrexMapKind, string[]>> = {};
  // Requests someone else already has open for keys we also want.
  const shared = new Set<Promise<void>>();
  let batches = 0;

  for (const [kind, keys] of Object.entries(wanted) as Array<[CrexMapKind, Iterable<string>]>) {
    const list: string[] = [];

    for (const key of new Set([...(keys ?? [])].map(cleanKey))) {
      if (!key || nameCache[kind].has(key)) continue;

      const open = inFlight.get(flightKey(kind, key));
      if (open) shared.add(open);
      else list.push(key);
    }

    if (list.length) {
      missing[kind] = list;
      batches = Math.max(batches, Math.ceil(list.length / MAPPING_BATCH));
    }
  }

  if (!batches) {
    // Nothing left to ask for, but another caller may still be fetching some of
    // what we need — returning now would hand back a cache with holes in it.
    if (shared.size) await Promise.all(shared);
    return nameCache;
  }

  // One request per slice across all buckets at once, rather than per bucket:
  // teams and venues for the same payload arrive together.
  const requests: Promise<unknown>[] = [];
  for (let i = 0; i < batches; i++) {
    const slice = Object.fromEntries(
      Object.entries(missing)
        .map(([kind, list]) => [kind, list.slice(i * MAPPING_BATCH, (i + 1) * MAPPING_BATCH)])
        .filter(([, list]) => list.length)
    ) as Partial<Record<CrexMapKind, string[]>>;

    const entries = Object.entries(slice) as Array<[CrexMapKind, string[]]>;
    if (!entries.length) continue;

    const request = getCrexMapping(slice, opts).then((mapping) => {
      for (const kind of ['t', 'v', 's', 'p'] as const) {
        for (const entry of mapping[kind] ?? []) remember(kind, entry);
      }
    });

    // What other callers wait on. Deliberately cannot reject: a failed mapping
    // call is this caller's error to handle, and poisoning an unrelated caller
    // that merely wanted an overlapping key would turn one failure into two.
    // The registry is cleared either way, so a failure is retried next time
    // rather than leaving the keys permanently "in flight".
    const settled = request.catch(() => undefined).finally(() => {
      for (const [kind, list] of entries) {
        for (const key of list) inFlight.delete(flightKey(kind, key));
      }
    });

    for (const [kind, list] of entries) {
      for (const key of list) inFlight.set(flightKey(kind, key), settled);
    }

    requests.push(request);
  }

  await Promise.all([...requests, ...shared]);

  return nameCache;
}

/** The teams, venues and series named by a batch of raw matches. */
export function resolveNames(
  matches: CrexRawMatch[],
  opts: FetchOpts = {}
): Promise<typeof nameCache> {
  return resolveKeys(
    {
      t: matches.flatMap((m) => [m.b, m.c]),
      v: matches.map((m) => m.v),
      s: matches.map((m) => m.q),
      // The award's player, on the finished matches that carry one. Cheap: a
      // full feed names a dozen or so, and resolved names are cached for good.
      p: matches.map((m) => (m.mm ?? '').split('.')[0]).filter(Boolean),
    },
    opts
  );
}

// ---------------------------------------------------------------------------
// Adapters onto our own vocabulary (@/types)
// ---------------------------------------------------------------------------

// `n` is not a flat status code — it packs three fields into one integer, and
// reading it as a threshold ("8 and up is finished") is what made multi-day
// matches collapse into Finished after the first day's play. The layout, taken
// from crex's own `liveHomeParsingMethod`:
//
//   format = n % 4                    0 T20, 1 ODI, 2 Test, 3 T10/The Hundred
//   state  = ⌊(n % 12) / 4⌋           0 upcoming, 1 live, 2 finished
//   day    = ⌊n / 12⌋ + 1             1-based day of a multi-day match
//
// So a Test's state code repeats every 12: day 1 live is 6, day 2 live is 18,
// day 3 is 30, day 4 is 42 — every one of them "8 or more", and every one of
// them a match still in progress. The same Test reads 46 once it is actually
// over (day 4, state 2), and 2 before a ball is bowled (day 1, state 0).
//
// Single-day formats never leave the first cycle, so `n` there stays inside
// 0–11, where the decode agrees with the old thresholds on every value the feed
// actually carries. It is stricter in one place: `n` in 4–7 is live even before
// a score is posted, so an ODI or T20 between the toss and the first ball now
// reads Live rather than Upcoming — which is what crex shows.

/** One turn of the state × format cycle; `n` gains this much per extra day. */
const STATE_CYCLE = 12;

/** States per cycle: the four format slots share one state code. */
const FORMAT_SLOTS = 4;

const STATE_STATUS: Record<number, MatchStatus> = {
  0: 'UPCOMING',
  1: 'LIVE',
  2: 'COMPLETED',
};

/** Format by `n % 4`. T10 and The Hundred fold into T20, as in `toMatchFormat`. */
const SLOT_FORMAT: Record<number, MatchFormat> = {
  0: 'T20',
  1: 'ODI',
  2: 'TEST',
  3: 'T20',
};

export interface CrexMatchState {
  status: MatchStatus;
  /** Format packed into `n`, already folded onto our three. */
  format: MatchFormat;
  /**
   * Day of play, 1-based. Always 1 on the single-day formats; on a Test it is
   * the day the state code describes, so it keeps counting up across the match.
   */
  day: number;
}

/** Unpack crex's `n`. Returns null for a value that cannot be one. */
export function decodeMatchState(n: number | undefined): CrexMatchState | null {
  if (n === undefined || !Number.isFinite(n) || n < 0) return null;

  const cycle = Math.floor(n) % STATE_CYCLE;
  const status = STATE_STATUS[Math.floor(cycle / FORMAT_SLOTS)];
  if (!status) return null;

  return {
    status,
    format: SLOT_FORMAT[cycle % FORMAT_SLOTS] ?? 'ODI',
    day: Math.floor(n / STATE_CYCLE) + 1,
  };
}

/**
 * Which of Live / Upcoming / Finished a feed match belongs under.
 *
 * `n` is asked first and believed: it is the field crex's own site switches on,
 * it says what the match *is* rather than what today's play is doing, and it is
 * the only signal that survives a Test's rest days, stumps, rain delays and
 * innings breaks without flipping. A day ending changes the day in `n`, not the
 * state, so the match stays Live until the whole thing is decided.
 *
 * `finishTime` and the scores are the fallback, for the fixtures that arrive
 * without `n` at all. `finishTime` is set once a match ends and never unset;
 * a match with a score and no completion signal is in progress, including the
 * mid-match states crex reports through `res` ("Innings Break", "Stumps").
 */
export function toMatchStatus(m: CrexRawMatch): MatchStatus {
  const state = decodeMatchState(m.n);

  if (state) {
    // Upcoming is a claim about a match that has not begun, and two things in
    // the payload can contradict it: a day counter past the first (an earlier
    // day was played) and a score on the board. crex keeps the state at "live"
    // through stumps and rest days, so neither is expected — but reading the
    // state alone would put a Test that had been batting for three days back
    // under Upcoming on the strength of one stale integer, and the fields that
    // rule it out are right there. Not a format special-case: a single-day
    // match cannot reach day 2, so the guard is inert for ODIs and T20s.
    if (state.status === 'UPCOMING' && (state.day > 1 || m.j || m.k)) return 'LIVE';
    return state.status;
  }

  if (m.finishTime) return 'COMPLETED';
  return m.j || m.k ? 'LIVE' : 'UPCOMING';
}

/**
 * crex's `fo` covers more formats than our schema does. "List A" and "One Day"
 * are 50-over games, so they fold into ODI; T10 and The Hundred fold into T20
 * as the nearest of our three.
 *
 * The Hundred is checked first and via `hb`, not `fo`: crex sends no `fo` at
 * all on those matches, so anything relying on the label alone mislabels a
 * 100-ball game as an ODI.
 *
 * `n` has the last word for anything the label does not cover. crex leaves `fo`
 * off more than The Hundred — T10 fixtures arrive bare too — and the ODI default
 * turned those into 50-over games. The format slot in `n` is unambiguous.
 */
export function toMatchFormat(m: CrexRawMatch): MatchFormat {
  if (m.hb) return 'T20';

  const f = (m.fo ?? '').toUpperCase();
  if (f.includes('TEST')) return 'TEST';
  if (f.includes('T20') || f.includes('T10') || f.includes('HUN')) return 'T20';
  if (f.includes('ODI') || f.includes('ONE DAY') || f.includes('LIST')) return 'ODI';

  return decodeMatchState(m.n)?.format ?? 'ODI';
}

// ---------------------------------------------------------------------------
// In-match state: breaks, interruptions, stumps
// ---------------------------------------------------------------------------
//
// The status table below is crex's own, transcribed from the map in their home
// bundle rather than guessed at. Two things about it are worth knowing:
//
//   - It is the ONLY structured source for an interruption. The ball feed
//     carries prose about a physio walking on but no code for it, so anything
//     not in this table (or in `res`) is not something we can report as an
//     official status without making it up.
//   - Stumps lives here, which is why a Test at the end of a day's play is
//     Live-with-a-note rather than finished. The two facts are independent and
//     crex sends them separately: `n` says the match is in progress, `a` says
//     nobody is batting at this moment.

interface NoteSpec {
  label: string;
  kind: MatchNoteKind;
  /** Play is stopped but the match lives on. */
  paused: boolean;
}

/**
 * crex's status codes, keyed by the letter that follows the "$".
 *
 * Labels are theirs, down to the wording — a reader comparing our page with
 * crex's should see the same words. Cancelled and abandoned are not `paused`:
 * play is not resuming, so the UI must not promise that it will.
 */
const NOTE_CODES: Record<string, NoteSpec> = {
  a: { label: 'Innings Break', kind: 'BREAK', paused: true },
  b: { label: 'Drinks Break', kind: 'BREAK', paused: true },
  c: { label: 'Lunch Break', kind: 'BREAK', paused: true },
  d: { label: 'Tea Break', kind: 'BREAK', paused: true },
  e: { label: 'Break', kind: 'BREAK', paused: true },
  f: { label: 'Rain Delay', kind: 'DELAY', paused: true },
  g: { label: 'Low Light Delay', kind: 'DELAY', paused: true },
  h: { label: 'Match Paused', kind: 'SUSPENDED', paused: true },
  i: { label: 'Cancelled due to rain', kind: 'SUSPENDED', paused: false },
  j: { label: 'Cancelled due to low light', kind: 'SUSPENDED', paused: false },
  k: { label: 'Match Cancelled', kind: 'SUSPENDED', paused: false },
  l: { label: 'Stumps', kind: 'STUMPS', paused: true },
  m: { label: 'Timeout', kind: 'BREAK', paused: true },
  n: { label: 'Match Drawn', kind: 'RESULT', paused: false },
  o: { label: 'Super Over', kind: 'RESULT', paused: false },
  p: { label: 'Match Tied', kind: 'RESULT', paused: false },
  q: { label: 'Abandoned', kind: 'SUSPENDED', paused: false },
  r: { label: 'Rescheduled', kind: 'SUSPENDED', paused: false },
  s: { label: 'Toss delayed', kind: 'DELAY', paused: true },
  t: { label: 'Toss delayed due to rain', kind: 'DELAY', paused: true },
  u: { label: 'Toss delayed due to bad weather', kind: 'DELAY', paused: true },
  v: { label: 'Toss delayed due to low light', kind: 'DELAY', paused: true },
  w: { label: 'Toss delayed due to wet outfield', kind: 'DELAY', paused: true },
  x: { label: 'No Result', kind: 'RESULT', paused: false },
};

/** `a` = "^0".."^3": which side won the toss and what they chose. */
const TOSS_CODES: Record<string, { side: 1 | 2; choice: 'bat' | 'bowl' }> = {
  '0': { side: 1, choice: 'bat' },
  '1': { side: 1, choice: 'bowl' },
  '2': { side: 2, choice: 'bat' },
  '3': { side: 2, choice: 'bowl' },
};

/**
 * Words that place a status crex sent as free text rather than as a code.
 *
 * This is a tone decision, not invented data: the label shown is always crex's
 * own string ("Start Delayed"), and all this picks is which icon and colour it
 * gets. An unrecognised status still displays, verbatim, as `INFO`.
 */
const NOTE_TEXT_KINDS: ReadonlyArray<[RegExp, MatchNoteKind]> = [
  [/stumps|day'?s play/i, 'STUMPS'],
  [/break|drinks|lunch|tea|timeout/i, 'BREAK'],
  [/delay|rain|wet|light|weather|suspend/i, 'DELAY'],
  [/abandon|cancel|no result/i, 'SUSPENDED'],
  [/drawn|tied|super over/i, 'RESULT'],
  [/toss/i, 'TOSS'],
];

/** Kinds that mean the match is over, so the note must not claim a pause. */
const TERMINAL_KINDS: ReadonlySet<MatchNoteKind> = new Set(['RESULT', 'SUSPENDED']);

/** Does this text read as a finished-match result rather than a live status? */
function looksLikeResult(text: string): boolean {
  return /won by|won the match|beat |wins? by/i.test(text);
}

/**
 * The match's own account of what is happening right now, or null when the
 * answer is "cricket".
 *
 * `a` is preferred over `res` because it is a code rather than a sentence: the
 * same interruption reads "Rain Delay" every time. `res` is the fallback, and it
 * is where the statuses crex has no code for arrive ("Start Delayed"); its
 * result text is filtered out, since a finished match's result already has a
 * home of its own on the card.
 */
export function decodeMatchNote(
  m: CrexRawMatch,
  teams: { first?: string; second?: string } = {}
): MatchNote | null {
  const detail = m.ac?.trim() || null;
  // A "!" is a display marker in crex's own renderer, not part of the code.
  const raw = (m.a ?? '').replace('!', '').trim();

  if (raw.startsWith('^')) {
    const toss = TOSS_CODES[raw.slice(1)];
    const side = toss && (toss.side === 1 ? teams.first : teams.second);
    if (toss && side) {
      return {
        label: `${side} won the toss and chose to ${toss.choice}`,
        kind: 'TOSS',
        detail,
        paused: false,
      };
    }
  }

  // "$l", or the bare "l" older payloads send. Both are one letter of the table;
  // anything longer is a word (a compressed blob or a plain status) and belongs
  // to the `res` path below.
  if (raw && !raw.startsWith('&')) {
    const letter = raw.startsWith('$') ? raw.slice(1) : raw;
    const spec = letter.length === 1 ? NOTE_CODES[letter.toLowerCase()] : undefined;
    if (spec) return { label: spec.label, kind: spec.kind, detail, paused: spec.paused };
  }

  const text = m.res?.trim();
  if (!text || looksLikeResult(text)) return null;

  const kind = NOTE_TEXT_KINDS.find(([pattern]) => pattern.test(text))?.[1] ?? 'INFO';
  return { label: text, kind, detail, paused: !TERMINAL_KINDS.has(kind) };
}

/**
 * "282/6(50.0" -> { runs: 282, wickets: 6, overs: 50 }. Tolerates the missing paren.
 *
 * A leading "!" marks a declaration ("!450/5(120.0"), which crex renders as
 * "450/5 d". It is stripped here and recorded as a flag, so a declared innings
 * is not mistaken for one still in progress on five wickets down.
 */
function parseScore(score: string | undefined, teamShortName: string): InningsScore | null {
  if (!score) return null;

  const trimmed = score.trim();
  const declared = trimmed.includes('!');
  const m = /^(\d+)\/(\d+)\s*\(?\s*([\d.]+)?/.exec(trimmed.replace(/!/g, ''));
  if (!m) return null;

  return {
    teamShortName,
    runs: Number(m[1]),
    wickets: Number(m[2]),
    overs: Number(m[3] ?? 0),
    ...(declared ? { declared } : null),
  };
}

/**
 * The innings the feed is carrying, tagged with whose they are and where each
 * one sits in the match.
 *
 * Built from all four slots rather than the two the header used to read, which
 * is what lets a Test card show "350 & 210" instead of only the first innings —
 * and lets the completed innings stay on screen once the next one starts, since
 * they are separate entries rather than one score being overwritten.
 *
 * The innings in progress comes from `d`, not from guesswork about wickets: an
 * innings can close on a declaration at five down or on an over limit at eight,
 * so counting wickets identifies neither reliably. Everything else with a score
 * has been played, and once the match is over nothing is current.
 */
function feedInnings(m: CrexRawMatch, home: Team, away: Team, status: MatchStatus): InningsScore[] {
  const pair = (m.d ?? 1) <= 2 ? 1 : 2;
  const battingSide = (m.d ?? 1) % 2 === 1 ? 1 : 2;

  const slots: Array<{ raw?: string; team: Team; side: 1 | 2; inningsNumber: number }> = [
    { raw: m.j, team: home, side: 1, inningsNumber: 1 },
    { raw: m.k, team: away, side: 2, inningsNumber: 1 },
    { raw: m.l, team: home, side: 1, inningsNumber: 2 },
    { raw: m.m, team: away, side: 2, inningsNumber: 2 },
  ];

  const out: InningsScore[] = [];

  for (const slot of slots) {
    const parsed = parseScore(slot.raw, slot.team.shortName);
    if (!parsed) continue;

    const current =
      status === 'LIVE' && slot.inningsNumber === pair && slot.side === battingSide;

    out.push({
      ...parsed,
      teamId: slot.team.id,
      inningsNumber: slot.inningsNumber,
      phase: current ? 'CURRENT' : 'COMPLETED',
    });
  }

  return out;
}

/** crex sends epoch ms, but substitutes a countdown string on some fixtures. */
function toStartTime(ti: number | string): string {
  const ms = typeof ti === 'number' ? ti : Number(ti);
  return Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : new Date().toISOString();
}

function toTeam(key: string, names: typeof nameCache): Team {
  const clean = cleanKey(key);
  const entry = names.t.get(clean);
  const name = entry?.n ?? clean;

  return {
    id: clean,
    name,
    shortName: entry?.sn ?? clean,
    country: name,
    logo: clean ? `${TEAM_LOGO_BASE}/${clean}.png` : null,
  };
}

/** Innings a match of each format plays in total. Four in a Test, two elsewhere. */
const TOTAL_INNINGS: Record<MatchFormat, number> = { TEST: 4, ODI: 2, T20: 2 };

/**
 * Has this innings finished? Ten down, declared, or the full quota of overs bowled.
 */
function inningsOver(inn: InningsScore, format: MatchFormat, perOver: number): boolean {
  if (inn.wickets >= 10 || inn.declared) return true;

  const scheduled = SCHEDULED_OVERS[format];
  // A Test innings has no over quota, so wickets and declarations are all there is.
  return scheduled !== null && oversFrom(Math.round(inn.overs * perOver), perOver) >= scheduled;
}

/**
 * The gap between innings, worked out from the score rather than read off a field.
 *
 * crex's own site says "Players Entering" here, but that word comes off their
 * Firebase live-state stream, which this app deliberately does not touch (see the
 * Worker's README). `/matches/live` sends nothing for it: at an innings break the
 * payload is simply a closed innings, no second score, and a live match state.
 *
 * That is enough to know what is happening, so the state is derived from those
 * three facts and labelled for what it is — an innings break. Nothing is invented:
 * if a ball had been bowled in the new innings there would be a score for it, and
 * if the innings that just ended were still going it would not be closed.
 */
function inningsBreakNote(
  innings: InningsScore[],
  status: MatchStatus,
  format: MatchFormat,
  perOver: number
): MatchNote | null {
  if (status !== 'LIVE') return null;

  // crex opens the next innings' slot the moment the last one closes, as an all-zero
  // score with no balls bowled. That IS the break, not an innings under way, so a
  // slot nobody has faced a ball in does not count as one played.
  const played = innings.filter((inn) => inn.overs > 0 || inn.runs > 0 || inn.wickets > 0);
  if (!played.length) return null;

  // Still innings to come, and every one played so far is finished.
  if (played.length >= TOTAL_INNINGS[format]) return null;
  if (!played.every((inn) => inningsOver(inn, format, perOver))) return null;

  return { label: 'Innings Break', kind: 'BREAK', detail: null, paused: true };
}

/**
 * Stoppages that cricket only ever takes between overs.
 *
 * An interval is called at the end of an over, a day's play closes at the end of
 * an over, and an innings ends on the ball that ends it. Rain and bad light are
 * deliberately not here: those stop play wherever the over happens to be.
 */
const OVER_BOUNDARY_KINDS: ReadonlySet<MatchNoteKind> = new Set(['BREAK', 'STUMPS']);

/**
 * How long after a delivery play is still, beyond argument, going on.
 *
 * Balls arrive 20-30 seconds apart in the feed. The shortest interval in cricket is
 * drinks at five minutes, and lunch, tea, an innings break and stumps are all longer
 * — so a delivery inside this window and a break cannot both be true, while the
 * window is still wide enough to sit out a review or a change of bowler without
 * calling the break off.
 */
const PLAY_RESUMED_MS = 150_000;

/** What is known about the match, for judging a stoppage crex reported. */
export interface StoppageCheck {
  innings: InningsScore[];
  format: MatchFormat;
  perOver?: number;
  /** The newest delivery in the ball feed, ISO, for callers that fetched one. */
  lastBallAt?: string | null;
  /**
   * The moment to read `lastBallAt` against — the poll that brought it, not
   * `Date.now()`, so a render stays a function of its props.
   */
  now?: number | null;
}

/**
 * Is a stoppage crex reported contradicted by what is happening around it?
 *
 * `a` and `res` are latches. crex sets them when play stops and clears them off
 * their Firebase live-state stream, which this app does not read (see the Worker's
 * README), so in `/matches/live` a "Lunch Break" outlives the lunch break — by
 * hours. The card then claimed nobody was batting while the over count beside it
 * climbed, and the match page headed a strip of deliveries from the over in
 * progress with "Lunch Break".
 *
 * Two things can contradict it, and neither is invented data:
 *
 *   - A part-bowled over. A break is called between overs, so balls going into an
 *     open innings mean the players are out there. An innings that *ended* mid-over
 *     is the exception — all out on the third ball is a real innings break — so an
 *     innings already closed keeps its note.
 *   - A delivery bowled seconds ago, where the caller has the ball feed. This is
 *     the stronger of the two and the one that catches a latch left on at an over
 *     boundary, which the score alone cannot.
 *
 * Only over-boundary stoppages are judged. Rain interrupts a half-bowled over all
 * the time, and nothing here would tell us it had stopped.
 */
export function isStaleStoppage(note: MatchNote, check: StoppageCheck): boolean {
  if (!note.paused || !OVER_BOUNDARY_KINDS.has(note.kind)) return false;

  const perOver = check.perOver || DEFAULT_BALLS_PER_OVER;

  if (check.lastBallAt && check.now) {
    const bowled = Date.parse(check.lastBallAt);
    if (Number.isFinite(bowled) && check.now - bowled < PLAY_RESUMED_MS) return true;
  }

  const batted = check.innings.filter((inn) => !inn.notStarted);
  const batting = batted.find((inn) => inn.phase === 'CURRENT') ?? batted[batted.length - 1];
  if (!batting || inningsOver(batting, check.format, perOver)) return false;

  return ballsFrom(batting.overs, perOver) % perOver !== 0;
}

/**
 * Does this note claim a stoppage that only happens between overs?
 *
 * The kinds that can be checked against play — see `isStaleStoppage` for why rain
 * and bad light are not among them.
 */
function isOverBoundaryStoppage(note: MatchNote | null | undefined): boolean {
  return Boolean(note?.paused && OVER_BOUNDARY_KINDS.has(note.kind));
}

/** One watched match: the stoppage it is reporting, and whether play went on under it. */
export interface StoppageWatch {
  label: string;
  signature: string;
  /** When the score last moved while this same stoppage stood. */
  movedAt: number | null;
}

/** The part of a match a break is supposed to hold still: every score on the board. */
function scoreSignature(match: Match): string {
  return (match.scorecard?.innings ?? [])
    .map((inn) => `${inn.runs}/${inn.wickets}@${inn.overs}`)
    .join('|');
}

/**
 * Drop the stoppages a caller has watched play carry straight through.
 *
 * The match list is the one surface with no ball feed to date the last delivery
 * against — a card cannot fetch commentary for every match in the carousel — so
 * for it the poll itself is the clock. A break means nobody is batting; if the
 * score moves while crex is still reporting one, the report is a latch left on
 * (see `isStaleStoppage`) and the card should say LIVE.
 *
 * Movement is only counted against a stoppage already being reported when the
 * previous score was taken. That is what keeps the last ball before lunch from
 * cancelling the lunch break it precedes: the note arrives with that score, not
 * after it. And the suppression is only good for `PLAY_RESUMED_MS`, so once the
 * score does settle — the players are off, whatever the label says — the stoppage
 * comes back rather than a resumption hours ago silencing every break that follows.
 *
 * `watch` is the caller's, and is updated in place: this needs a memory of the
 * previous poll, and the hook holding it across renders is the natural owner.
 */
export function clearResumedStoppages(
  matches: Match[],
  watch: Map<string, StoppageWatch>,
  now: number
): Match[] {
  const live = new Set(matches.map((m) => m.id));
  for (const id of watch.keys()) {
    if (!live.has(id)) watch.delete(id);
  }

  return matches.map((match) => {
    if (!isOverBoundaryStoppage(match.note)) {
      watch.delete(match.id);
      return match;
    }

    const label = match.note!.label;
    const signature = scoreSignature(match);
    const seen = watch.get(match.id);

    // A stoppage we have not seen before — or a different one — starts its own
    // watch. Nothing yet contradicts it.
    if (!seen || seen.label !== label) {
      watch.set(match.id, { label, signature, movedAt: null });
      return match;
    }

    const movedAt = seen.signature === signature ? seen.movedAt : now;
    watch.set(match.id, { label, signature, movedAt });

    return movedAt !== null && now - movedAt < PLAY_RESUMED_MS
      ? { ...match, note: null }
      : match;
  });
}

/**
 * Which of the two accounts of the match state to believe.
 *
 * A stoppage crex reports itself normally wins — it knows about rain and stumps and
 * we do not. But crex leaves the toss code in `a` for the whole first innings, and
 * an hour later "won the toss and chose to bat" is not what is happening: it masks
 * the innings break the scores plainly show. So a derived break outranks any note
 * that is not itself a stoppage, and the toss survives only while there is nothing
 * truer to say.
 *
 * A reported stoppage the score has already overtaken is dropped outright — see
 * `isStaleStoppage`. Saying nothing is right when play has restarted: the card
 * falls back to LIVE, which is what is happening.
 */
function pickNote(
  reported: MatchNote | null,
  derived: MatchNote | null,
  check: StoppageCheck
): MatchNote | null {
  const current = reported && isStaleStoppage(reported, check) ? null : reported;

  if (current?.paused) return current;
  return derived ?? current;
}

/**
 * Build one of our `Match` objects from a crex match plus the resolved names.
 *
 * Unresolved keys degrade to the key itself rather than throwing — a match with
 * an unknown team still renders, just with "X6" where a name should be.
 */
/** crex's "this player has no figures of this kind" placeholder. */
const NO_FIGURES = '-^-';

const figures = (raw: string | undefined): string | null =>
  raw && raw !== NO_FIGURES ? raw : null;

/**
 * The match award from `mm`. Null when crex has not named one — which is every
 * match still being played, and the odd finished one (a washout has no award).
 */
function decodePlayerOfMatch(
  m: CrexRawMatch,
  names: typeof nameCache
): PlayerOfMatch | null {
  const [playerKey, teamKey, batting, bowling] = (m.mm ?? '').split('.');
  const player = cleanKey(playerKey);
  if (!player) return null;

  const team = cleanKey(teamKey);

  return {
    id: player,
    // A key we could not resolve is shown as the key rather than dropped: crex
    // only names an award once, and losing it to a missed mapping lookup would
    // be worse than printing "IZ".
    name: names.p.get(player)?.n ?? player,
    teamId: team,
    teamShortName: names.t.get(team)?.sn ?? team,
    batting: figures(batting),
    bowling: figures(bowling),
  };
}

export function toMatch(id: string, m: CrexRawMatch, names: typeof nameCache): Match {
  const homeTeam = toTeam(m.b, names);
  const awayTeam = toTeam(m.c, names);

  const seriesKey = cleanKey(m.q);
  const status = toMatchStatus(m);
  const state = decodeMatchState(m.n);
  const format = toMatchFormat(m);
  const innings = feedInnings(m, homeTeam, awayTeam, status);
  // The Hundred is scored in sets of five, so an over quota has to be read against
  // its own balls-per-over rather than six.
  const perOver =
    m.hb === HUNDRED_BALLS_PER_OVER ? HUNDRED_BALLS_PER_OVER : DEFAULT_BALLS_PER_OVER;

  return {
    id,
    homeTeam,
    awayTeam,
    series: { id: seriesKey, name: names.s.get(seriesKey)?.n ?? 'Cricket' },
    format,
    status,
    venue: names.v.get(cleanKey(m.v))?.n ?? 'TBD',
    venueId: cleanKey(m.v) || null,
    startTime: toStartTime(m.ti),
    // `hb` carries the balls-per-over on The Hundred and is absent elsewhere.
    ballsPerOver: perOver,
    // Any `hb` at all marks a 100-ball game. Worth carrying separately from the
    // format (which folds The Hundred into T20): a required run rate worked out
    // against T20's 120 balls would give a chase 20 balls it does not have.
    ballsLimit: m.hb ? HUNDRED_BALLS : null,
    // `res` carries mid-match states too, so only surface it as a result once
    // the match is actually over.
    result: status === 'COMPLETED' ? m.res ?? m.a ?? null : null,
    // Whatever has stopped play, in crex's words where they sent them, and
    // derived from the innings state where they did not. Independent of `status`:
    // a Test at stumps is LIVE with a STUMPS note, and both facts are needed to
    // say "day 3 — stumps" rather than either "in progress" or "finished".
    note: pickNote(
      decodeMatchNote(m, { first: homeTeam.shortName, second: awayTeam.shortName }),
      inningsBreakNote(innings, status, format, perOver),
      { innings, format, perOver }
    ),
    // Only meaningful where a match spans days; `n` reports 1 for the rest.
    day: state && state.format === 'TEST' ? state.day : null,
    // crex sets `mm` only on a finished match, so this needs no status guard of
    // its own — but it is still read through `status`, because a result and the
    // award that goes with it belong to the same moment.
    playerOfMatch: status === 'COMPLETED' ? decodePlayerOfMatch(m, names) : null,
    scorecard: innings.length ? { innings } : null,
  };
}

/**
 * A single match by crex key, or null if nothing knows the key.
 *
 * The live list is tried first: it is one cache entry shared with the home page,
 * and it carries everything this app renders — crex's per-match endpoints return
 * a heavily encoded live-state blob (`"l":"43:1.1.6.2.W.1"`) that we do not
 * decode.
 *
 * But that list is a *window* — what is on now, next, and just gone. Anything
 * older has aged out of it, and every link into an older match (a player's
 * recent form, a finished series' schedule, a fixture from last month) used to
 * land on a 404 for that reason alone. `getCrexArchivedMatch` is the fallback
 * for those.
 */
export async function getCrexMatch(id: string, opts: FetchOpts = {}): Promise<Match | null> {
  const raw = await getCrexMatches(opts);
  const match = raw[id];
  if (match && isRenderableMatch(match)) {
    const names = await resolveNames([match], opts);
    return toMatch(id, match, names);
  }

  return getCrexArchivedMatch(id, opts).catch(() => null);
}

/**
 * One call for the common case: fetch the match list, resolve whatever names
 * are new, and hand back finished `Match` objects sorted newest-first.
 */
export async function getCrexMatchList(opts: FetchOpts = {}): Promise<Match[]> {
  const raw = await getCrexMatches(opts);
  // Stubs are dropped before names are resolved, so they cost neither a card nor
  // a mapping lookup.
  const entries = Object.entries(raw).filter(([, m]) => isRenderableMatch(m));
  const names = await resolveNames(entries.map(([, m]) => m), opts);

  return entries
    .map(([id, m]) => toMatch(id, m, names))
    .sort((a, b) => +new Date(b.startTime) - +new Date(a.startTime));
}

// ---------------------------------------------------------------------------
// Scorecard
// ---------------------------------------------------------------------------
//
// getSC4 returns one object per innings, each a bundle of packed strings.
//
// A batting line looks like:
//
//   AMG.70.73.7.4.165.122.2.7RD.APN/22.10-99.32/
//   |   |  |  | | |   |   | |   |
//   |   |  |  | | |   |   | |   `- fielder key (catcher, keeper, run-out thrower)
//   |   |  |  | | |   |   | `----- bowler key
//   |   |  |  | | |   |   `------- dismissal type code (see DISMISSALS)
//   |   |  |  | | |   `----------- team runs when out
//   |   |  |  | | `--------------- team balls when out
//   |   |  |  | `----------------- sixes
//   |   |  |  `------------------- fours
//   |   |  `---------------------- balls
//   |   `------------------------- runs
//   `----------------------------- player key
//
// The trailing /…/ is wagon-wheel data, ignored. A batsman still at the crease
// stops after `sixes`; a player yet to bat is the bare key with no dots at all,
// which is how the XI arrives before an innings starts.
//
// A bowling line (`a`) is the same idea, one per bowler used:
//
//   BQZ.37.24.0.2[.9]
//   |   |  |  | |  `- dot balls (absent in some feeds)
//   |   |  |  | `---- wickets
//   |   |  |  `------ maidens
//   |   |  `--------- balls
//   |   `------------ runs conceded
//   `---------------- player key
//
// Both layouts, and the dismissal codes below, are taken from crex's own
// scorecard bundle rather than inferred, and check out arithmetically: bowler
// runs + byes + leg-byes equal the innings total, bowler balls equal the
// innings balls, and bowler wickets plus run-outs equal the wicket count.

interface CrexScorecardInnings {
  /** Bowling lines, one per bowler used by the fielding side. */
  a?: string[];
  /** Batting lines, one per player in the XI. */
  b?: string[];
  /** Batting team key. */
  c?: string;
  /** Innings total, "185/10(202" — runs/wickets(balls). */
  d?: string;
  /** Extras, "byes.legByes.wides.noBalls.penalty". */
  e?: string;
  /** Partnerships — not surfaced in the UI. */
  p?: string[];
}

/**
 * "byes.legByes.wides.noBalls.penalty" → the five lines, plus their sum.
 *
 * Missing or short strings degrade to zeroes rather than NaN: crex sends a bare
 * "" for an innings that has not conceded an extra yet, and older cards stop
 * before the penalty field.
 */
function decodeExtras(raw: string | undefined): { total: number; breakdown: ExtrasBreakdown } {
  const [byes, legByes, wides, noBalls, penalty] = (raw ?? '')
    .split('.')
    .map((n) => Number(n) || 0);
  const breakdown: ExtrasBreakdown = {
    byes: byes ?? 0,
    legByes: legByes ?? 0,
    wides: wides ?? 0,
    noBalls: noBalls ?? 0,
    penalty: penalty ?? 0,
  };

  return {
    total: Object.values(breakdown).reduce((sum, n) => sum + n, 0),
    breakdown,
  };
}

/** Index of the dismissal-type token; its presence means the innings ended. */
const DISMISSAL_TYPE_INDEX = 7;
const BOWLER_INDEX = 8;
const FIELDER_INDEX = 9;

/**
 * Dismissal type codes, verbatim from crex's scorecard bundle.
 *
 * Two of them — retired and absent hurt — end a batsman's innings without a
 * wicket being credited, so they are flagged separately from the rest.
 */
const RETIRED_CODES = new Set(['11', '13']);

/**
 * The three ways a batsman's innings ends without a wicket, by dismissal code.
 *
 * Injury is not something crex publishes as a match status — there is no code
 * for a physio on the field, and the ball feed only mentions one in prose. These
 * are the API's own record of a player leaving the middle hurt, so they are what
 * the UI reports, rather than a guess read out of commentary text.
 */
const RETIREMENT_KINDS: Record<string, RetirementKind> = {
  '11': 'HURT',
  '12': 'OUT',
  '13': 'ABSENT',
};

/** crex renders the third name token, or the last if the name is shorter. */
function shortName(key: string | undefined, names: typeof nameCache): string {
  if (!key) return '';
  const full = names.p.get(key)?.n;
  if (!full) return key;

  const parts = full.trim().split(/\s+/);
  return parts[Math.min(parts.length - 1, 2)];
}

/**
 * "c Pandya b Bumrah" from the type code plus the two player keys.
 *
 * Every branch degrades to the bare verb when a name is missing, so an
 * unresolved key produces "caught" rather than "c undefined b undefined".
 */
function describeDismissal(head: string[], names: typeof nameCache): string {
  const bowler = shortName(head[BOWLER_INDEX], names);
  const fielder = shortName(head[FIELDER_INDEX], names);

  switch (head[DISMISSAL_TYPE_INDEX]) {
    case '1':
      return bowler ? `b ${bowler}` : 'bowled';
    case '2':
      if (fielder && bowler) return `c ${fielder} b ${bowler}`;
      return bowler ? `b ${bowler}` : 'caught';
    case '3':
      return bowler ? `c & b ${bowler}` : 'caught & bowled';
    case '4':
      if (bowler && fielder) return `run out (${bowler} / ${fielder})`;
      return bowler ? `run out (${bowler})` : 'run out';
    case '5':
      return bowler ? `lbw b ${bowler}` : 'lbw';
    case '6':
      return bowler ? `hit wicket b ${bowler}` : 'hit wicket';
    case '8':
      if (fielder && bowler) return `st ${fielder} b ${bowler}`;
      return bowler ? `st b ${bowler}` : 'stumped';
    case '9':
      return bowler ? `mankaded (${bowler})` : 'mankaded';
    case '10':
      return 'obstructing the field';
    case '11':
      return 'retired hurt';
    case '12':
      return 'retired out';
    case '13':
      return 'absent hurt';
    case '14':
      return 'timed out';
    default:
      return 'out';
  }
}

function decodeBatsman(line: string, names: typeof nameCache): BatsmanLine | null {
  const head = line.split('/')[0].split('.');
  const [key, runs, balls, fours, sixes] = head;

  // A bare key is a player yet to bat — that is `yetToBat`, not a card row.
  if (!key || head.length < 2) return null;

  const r = Number(runs) || 0;
  const b = Number(balls) || 0;
  const dismissed = head.length > DISMISSAL_TYPE_INDEX;

  return {
    playerId: key,
    name: names.p.get(key)?.n ?? key,
    runs: r,
    balls: b,
    fours: Number(fours) || 0,
    sixes: Number(sixes) || 0,
    strikeRate: b ? Math.round((r / b) * 10000) / 100 : 0,
    // A retirement is not a wicket, so it must not count as `out` — but it does
    // end the innings, and the text below says which it was.
    out: dismissed && !RETIRED_CODES.has(head[DISMISSAL_TYPE_INDEX]),
    dismissal: dismissed ? describeDismissal(head, names) : 'not out',
    ...(dismissed && RETIREMENT_KINDS[head[DISMISSAL_TYPE_INDEX]]
      ? { retired: RETIREMENT_KINDS[head[DISMISSAL_TYPE_INDEX]] }
      : null),
  };
}

function decodeBowler(
  line: string,
  names: typeof nameCache,
  perOver: number
): BowlerLine | null {
  const [key, runs, balls, maidens, wickets] = line.split('/')[0].split('.');
  if (!key || balls === undefined) return null;

  const r = Number(runs) || 0;
  const b = Number(balls) || 0;

  return {
    playerId: key,
    name: names.p.get(key)?.n ?? key,
    overs: oversFrom(b, perOver),
    maidens: Number(maidens) || 0,
    runs: r,
    wickets: Number(wickets) || 0,
    economy: b ? Math.round((r / (b / perOver)) * 100) / 100 : 0,
  };
}

/**
 * Innings totals, batting and bowling cards for a crex match, in order.
 *
 * `status` is optional and only decides whether the innings in progress is
 * marked CURRENT: this endpoint returns a card, not a match state, and a card on
 * its own cannot tell a live innings from the last one of a finished match.
 */
export async function getCrexScorecard(
  matchKey: string,
  opts: FetchOpts & { ballsPerOver?: number; status?: MatchStatus } = {}
): Promise<InningsScore[]> {
  const perOver = opts.ballsPerOver || DEFAULT_BALLS_PER_OVER;

  const raw = await crexGet<CrexScorecardInnings[] | Record<string, CrexScorecardInnings>>(
    `/match/scorecard?key=${encodeURIComponent(matchKey)}`,
    { revalidate: 5, ...opts }
  );

  const innings = Array.isArray(raw) ? raw : Object.values(raw ?? {});
  if (!innings.length) return [];

  // Every key the card can name: batters, bowlers, and the catchers, keepers
  // and fielders credited in a dismissal. Missing any of them would print a
  // raw key like "c 6QP b BGT" on the page.
  const playerKeys = innings.flatMap((i) => [
    ...(i.b ?? []).flatMap((line) => {
      const head = line.split('/')[0].split('.');
      return [head[0], head[BOWLER_INDEX], head[FIELDER_INDEX]];
    }),
    ...(i.a ?? []).map((line) => line.split('.')[0]),
  ]);
  const teamKeys = innings.map((i) => cleanKey(i.c)).filter(Boolean);

  await resolveKeys({ p: playerKeys.filter(Boolean), t: teamKeys }, opts);

  // Each side's innings are numbered as they arrive: the card lists them in slot
  // order (team 1's first, team 2's first, team 1's second, team 2's second), so
  // a side's second entry is its second innings.
  const seenPerTeam = new Map<string, number>();
  const cards = innings.flatMap((inn) => {
    const total = /^(\d+)\/(\d+)\((\d+)/.exec(inn.d ?? '');
    const teamKey = cleanKey(inn.c);
    const balls = total ? Number(total[3]) : 0;
    const lines = inn.b ?? [];

    // Nothing at all — not even an XI — is an innings crex is holding a slot
    // for. Emitting it would put a phantom "0/0" on the scorecard.
    if (!total && !lines.length) return [];

    const inningsNumber = (seenPerTeam.get(teamKey) ?? 0) + 1;
    seenPerTeam.set(teamKey, inningsNumber);

    const extras = decodeExtras(inn.e);

    return {
      teamId: teamKey,
      inningsNumber,
      teamShortName: nameCache.t.get(teamKey)?.sn ?? teamKey,
      runs: total ? Number(total[1]) : 0,
      wickets: total ? Number(total[2]) : 0,
      overs: oversFrom(balls, perOver),
      // An innings with an XI but no total has not begun. Callers use this to
      // keep a "0/0" out of the header while still listing the side.
      notStarted: !total,
      extras: extras.total,
      extrasBreakdown: extras.breakdown,
      batting: lines
        .map((line) => decodeBatsman(line, nameCache))
        .filter((x): x is BatsmanLine => x !== null),
      // The bare keys, in card order: the rest of the XI, or the whole XI when
      // the innings has not started.
      yetToBat: lines
        .filter((line) => !line.split('/')[0].includes('.'))
        .map((line) => {
          const key = line.split('/')[0];
          return { playerId: key, name: nameCache.p.get(key)?.n ?? key };
        }),
      bowling: (inn.a ?? [])
        .map((line) => decodeBowler(line, nameCache, perOver))
        .filter((x): x is BowlerLine => x !== null),
    };
  });

  // Phases in one pass over the finished list, because "current" is a statement
  // about the whole card: it is the last innings that has batted, and only while
  // the match is live. A side listed with an XI and no total has not begun.
  const lastBatted = cards.reduce((last, inn, i) => (inn.notStarted ? last : i), -1);

  return cards.map((inn, i) => ({
    ...inn,
    phase: (inn.notStarted
      ? 'UPCOMING'
      : i === lastBatted && opts.status === 'LIVE'
        ? 'CURRENT'
        : 'COMPLETED') satisfies InningsPhase as InningsPhase,
  }));
}

// ---------------------------------------------------------------------------
// Squads
// ---------------------------------------------------------------------------

/**
 * crex's pre-match info payload. Only the three fields the squad list needs are
 * described; the same response also carries the weather, the broadcasters and
 * the head-to-head, none of which this app renders yet.
 */
interface CrexMatchInfo {
  /**
   * Both squads. Sides are split on "/" in the order `t` gives, players within
   * a side on "-", and a player's own fields on ".":
   *
   *   "EX.166.1.1.0.0.0.0.1-1IG.38.1.1..."
   *    |   |   |
   *    |   |   role — 1 batter, 2 bowler, 3 all-rounder
   *    |   caps in this format
   *    player f_key, resolved through /mapping
   *
   * The trailing field is crex's own sort bucket (right-hand bat, left-hand bat,
   * all-rounder, spinner, seamer), which is why their list reads in that order —
   * we keep their order but do not need the bucket itself.
   */
  tb?: string;
  /** Captain and keeper of each side in turn: "<t1 capt>/<t1 wk>/<t2 capt>/<t2 wk>". */
  x?: string;
  /** Team f_keys, in the order `tb` lists them: "S-U". */
  t?: string;
  /**
   * Series f_key. The one field that makes an aged-out match recoverable: the
   * series' own schedule still lists it, with its result and its status, long
   * after the live feed has dropped it. See `getCrexArchivedMatch`.
   */
  s?: string;
  /** Venue f_key. */
  v?: string;
  /** Scheduled start, ISO. */
  dt?: string;
  /** Format label, crex's wording: "Test", "First Class", "One Day". */
  fo?: string;
}

/** `tb`'s role field. Anything unrecognised falls back to batter. */
const SQUAD_ROLES: Record<string, PlayerRole> = {
  '1': 'BATSMAN',
  '2': 'BOWLER',
  '3': 'ALL_ROUNDER',
};

/** Field positions within one dot-packed `tb` player. */
const SQUAD_KEY_INDEX = 0;
const SQUAD_ROLE_INDEX = 2;

/**
 * Both squads for a match, keyed by team f_key.
 *
 * This is the only crex endpoint that names an XI before the match starts —
 * `/match/scorecard` holds an empty innings slot until the first ball, so a
 * scorecard is all the app could show for a Test that has not begun. Rather
 * than resolve home and away here, the two sides are returned under their own
 * team keys and the caller matches them to `match.homeTeam.id`: `tb`'s order is
 * crex's, not ours.
 *
 * Empty object when crex has no squad yet — an announced XI arrives a day or
 * two before the toss, and for some domestic matches never does.
 *
 * Only trustworthy BEFORE the match starts. Once play is on, crex prunes `tb`
 * down to a handful of players (the bench and the batters still to come — its
 * own captain and keeper keys are no longer even in the list), so a caller must
 * not read this as the squad of a live or finished match. It does not need to:
 * from the first ball the scorecard names everyone.
 */
export async function getCrexMatchSquads(
  matchKey: string,
  opts: FetchOpts = {}
): Promise<Record<string, SquadPlayer[]>> {
  const info = await crexGet<CrexMatchInfo>(
    `/match/info?key=${encodeURIComponent(matchKey)}`,
    { revalidate: 300, ...opts }
  );

  // An id crex does not know answers with a bare `null`, not a 404.
  const sides = (info?.tb ?? '').split('/').filter(Boolean);
  const teamKeys = (info?.t ?? '').split('-').map(cleanKey);
  if (!sides.length || !teamKeys.length) return {};

  // Captain and keeper come in pairs, one pair per side, in `tb`'s order.
  const roleMarks = (info?.x ?? '').split('/').map(cleanKey);

  const players = sides.map((side) =>
    side
      .split('-')
      .filter(Boolean)
      .map((entry) => entry.split('.'))
      .filter((fields) => fields[SQUAD_KEY_INDEX])
  );

  // One mapping call for both squads — roughly 30 keys, well inside the cap.
  await resolveKeys({ p: players.flat().map((fields) => fields[SQUAD_KEY_INDEX]) }, opts);

  const out: Record<string, SquadPlayer[]> = {};
  players.forEach((side, i) => {
    const teamKey = teamKeys[i];
    if (!teamKey) return;

    const captain = roleMarks[i * 2];
    const keeper = roleMarks[i * 2 + 1];

    out[teamKey] = side.map((fields) => {
      const key = cleanKey(fields[SQUAD_KEY_INDEX]);
      const role = SQUAD_ROLES[fields[SQUAD_ROLE_INDEX]] ?? 'BATSMAN';

      return {
        id: key,
        name: nameCache.p.get(key)?.n ?? key,
        // A keeper is listed as a batter in `tb`; the distinction only exists in
        // `x`, so it is applied over the role rather than alongside it.
        role: key === keeper ? 'WK' : role,
        isCaptain: key === captain,
      };
    });
  });

  return out;
}

// ---------------------------------------------------------------------------
// Commentary
// ---------------------------------------------------------------------------

interface CrexBallFeed {
  /**
   * The outcome, crex's own shorthand. Seen in live data: a plain count off
   * the bat ("0", "4"), "W" for a wicket, "WD"/"NB" for a wide or no ball that
   * cost only its penalty, "<n>wd"/"<n>nb" when runs came off one, "<n>lb" and
   * "<n>b" for leg byes and byes, and "<bat>+<extra>" for a ball that was both.
   * Parsed by `parseBallOutcome` — `Number(b)` is NaN on every form but the
   * first, which is what used to render a wide as "0".
   */
  b?: string | number;
  /** Over.ball, e.g. "48.2". */
  o?: string | number;
  /** Headline, "Bowler to Batsman". */
  c1?: string;
  /** Descriptive text. Often empty on minor events. */
  c2?: string;
  /**
   * Event kind. `"b"` is a delivery; everything else is a marker the same feed
   * interleaves — `"o"` an over summary, `"w"` a wicket card, `"ic2"` an innings
   * closing, `"tc"` a target, `"to"` the toss, `"pm"`/`"tm"` a milestone,
   * `"rc"`/`"ac"` an umpire review, `"t"` a written note, and `"ps"`/`"pbc"`/
   * `"pl"` the stat cards and polls crex's own app shows.
   */
  type?: string;
  /** Epoch ms. */
  id?: number;
  /** The marker's sentence, on the event rows that carry one. */
  c?: string;
  /** Over number on an over summary. */
  on?: number;
  /** Runs off the over. */
  runs?: number;
  /** Wickets in the over. */
  ow?: number;
  /** Player or team name on a milestone or wicket card. */
  n?: string;
  /** Batsman's name on a wicket card. */
  player_fullname?: string;
  /** Runs and balls on a wicket card. */
  r?: number;
  /** Innings index, 0-based. */
  inning?: number;
}

/**
 * How many deliveries to page back for. Three overs — the recent-balls strip in
 * the match header is sized to that, and one page of the feed is barely two
 * once over summaries and milestone markers are filtered out.
 */
const MIN_BALLS = 18;

/** Stop regardless, so a feed that keeps handing back events can't spin. */
const MAX_COMMENTARY_PAGES = 5;

/**
 * A real delivery, as opposed to the over summaries, partnership notes and
 * milestone markers the same feed carries. Those arrive as `type: "w"` rows
 * with no commentary text and a `b` that is a partnership total, not a ball's
 * outcome — counting them as wickets is where the old filter went wrong.
 */
function isDelivery(f: CrexBallFeed): boolean {
  return f.type === 'b' && String(f.o ?? '').includes('.');
}

/** What a delivery cost, decoded from crex's `b` shorthand. */
export interface BallOutcome {
  /** Bat runs + extras, penalty included — what the total went up by. */
  runs: number;
  batRuns: number;
  extraRuns: number;
  extra: BallExtra | null;
  isWicket: boolean;
}

const EXTRA_CODES: Record<string, BallExtra> = {
  wd: 'wide',
  nb: 'noball',
  lb: 'legbye',
  b: 'bye',
};

/** Wides and no balls cost a run before anything is run or hit. */
const PENALTY: Partial<Record<BallExtra, number>> = { wide: 1, noball: 1 };

/**
 * Decode one `b` value.
 *
 * The forms live data actually sends, all confirmed against the running total
 * on either side of the ball:
 *
 * - `"0"`, `"4"` — runs off the bat.
 * - `"W"` — wicket. Runs may ride along on a run out (`"W+1"`, `"1W"`).
 * - `"WD"`, `"NB"` — a wide or no ball that cost only its one-run penalty.
 * - `"4wd"`, `"2nb"` — the same plus runs: `"4wd"` is five to the total.
 * - `"1lb"`, `"4b"` — leg byes and byes. Legal deliveries, no penalty.
 * - `"0+1"` — runs off the bat plus extras on the same ball.
 *
 * Anything unrecognised decodes to a dot rather than throwing: an unknown
 * shorthand should cost the reader one ball, not the whole strip.
 */
export function parseBallOutcome(raw: unknown): BallOutcome {
  const none: BallOutcome = {
    runs: 0,
    batRuns: 0,
    extraRuns: 0,
    extra: null,
    isWicket: false,
  };

  const token = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
  if (!token) return none;

  // Peel the wicket marker off first so the rest parses as a plain outcome —
  // a run out can carry runs, and a wicket off a no ball carries the penalty.
  let body = token;
  let isWicket = false;
  // The marker only comes off when what is left is itself an outcome — "wd"
  // opens with the same letter and is a wide, not a wicket.
  const REST = String.raw`\d*(?:wd|nb|lb|b)?`;
  const wicket =
    body.match(new RegExp(`^w\\+?(${REST})$`)) ?? body.match(new RegExp(`^(${REST})\\+?w$`));
  if (wicket) {
    isWicket = true;
    body = wicket[1];
  }
  if (!body) return { ...none, isWicket };

  // "<n>wd" / "<n>nb" / "<n>lb" / "<n>b" — the count is what was run or hit,
  // on top of the penalty. Bare "WD"/"NB" is the penalty on its own.
  const extra = body.match(/^(\d*)(wd|nb|lb|b)$/);
  if (extra) {
    const kind = EXTRA_CODES[extra[2]];
    const penalty = PENALTY[kind] ?? 0;
    // A bare "1lb" is one leg bye; a bare "NB" is a no ball nobody scored off.
    const scored = extra[1] === '' ? (penalty ? 0 : 1) : Number(extra[1]);
    // Runs off a no ball are the batter's; off a wide they never are.
    const batRuns = kind === 'noball' ? scored : 0;
    const extraRuns = penalty + (kind === 'noball' ? 0 : scored);
    return { runs: batRuns + extraRuns, batRuns, extraRuns, extra: kind, isWicket };
  }

  // "<bat>+<extra>" — both on one ball, with no kind given for the extra.
  const split = body.match(/^(\d+)\+(\d+)$/);
  if (split) {
    const batRuns = Number(split[1]);
    const extraRuns = Number(split[2]);
    return { runs: batRuns + extraRuns, batRuns, extraRuns, extra: null, isWicket };
  }

  const plain = body.match(/^\d+$/);
  if (plain) {
    const batRuns = Number(body);
    return { runs: batRuns, batRuns, extraRuns: 0, extra: null, isWicket };
  }

  return { ...none, isWicket };
}

/**
 * The events in the ball feed that are not deliveries, newest first.
 *
 * Everything here is crex's own — their sentence where they sent one, their
 * numbers where they did not. Nothing is inferred from prose: an over summary
 * becomes "End of over 22" because the row says `on: 21` and `runs: 6`, not
 * because something in the text looked like an over.
 *
 * The rows crex's own app renders as cards rather than events — a batsman's
 * career stats, a head-to-head, a poll — are dropped: they are UI payloads, not
 * things that happened in the match.
 */
const EVENT_LABELS: Partial<Record<string, { label: string; kind: MatchEventKind }>> = {
  w: { label: 'Wicket', kind: 'WICKET' },
  o: { label: 'Over complete', kind: 'OVER' },
  ic2: { label: 'Innings end', kind: 'INNINGS_END' },
  tc: { label: 'Target set', kind: 'TARGET' },
  to: { label: 'Toss', kind: 'TOSS' },
  // A player and a team milestone share one label: the sentence beside it already
  // names whose it is ("R Ram Arvindh — Scored 50 in 28 Balls" against "Chepauk
  // Super Gillies — Scored 100 in 10.0 overs"), and "Team milestone" was long
  // enough that the tag had to be cut to an ellipsis to fit.
  pm: { label: 'Milestone', kind: 'MILESTONE' },
  tm: { label: 'Milestone', kind: 'MILESTONE' },
  rc: { label: 'Umpire review', kind: 'REVIEW' },
  ac: { label: 'Umpire review', kind: 'REVIEW' },
  t: { label: 'Update', kind: 'NOTE' },
};

/** crex writes bold tags and entities into its commentary; the UI renders text. */
function plainText(raw: string | undefined): string {
  return (raw ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** One feed row as an event, or null when it is a delivery or a UI card. */
function toMatchEvent(f: CrexBallFeed): MatchEvent | null {
  if (isDelivery(f)) return null;

  const spec = EVENT_LABELS[f.type ?? ''];
  if (!spec) return null;

  // `on` is the 0-based over the row belongs to, and -1 on the rows crex does not
  // tie to one. It is also 0 on the toss and on a target being set, where an over
  // number would be an invention — those happen between overs, not during one.
  const OVERLESS: ReadonlySet<MatchEventKind> = new Set(['TOSS', 'TARGET']);
  const over =
    f.on !== undefined && f.on >= 0 && !OVERLESS.has(spec.kind) ? f.on + 1 : null;
  let label = spec.label;
  let text = plainText(f.c);

  if (spec.kind === 'OVER') {
    label = over ? `End of over ${over}` : 'Over complete';
    // No sentence on these rows — the figures are the event.
    const runs = f.runs ?? 0;
    const wickets = f.ow ?? 0;
    text =
      `${runs} run${runs === 1 ? '' : 's'}` +
      (wickets ? `, ${wickets} wicket${wickets === 1 ? '' : 's'}` : '');
  } else if (spec.kind === 'WICKET' && !text) {
    // A wicket card without commentary still names who went, and for how many.
    const who = f.player_fullname ?? f.n;
    text = who ? `${who} out${f.r !== undefined ? ` for ${f.r}` : ''}` : '';
  } else if (spec.kind === 'MILESTONE' && f.n) {
    text = `${f.n} — ${text}`;
  }

  if (!text) return null;

  return {
    id: String(f.id ?? `${f.type}-${f.on ?? ''}`),
    kind: spec.kind,
    label,
    text,
    over,
    timestamp: f.id ? new Date(f.id).toISOString() : undefined,
  };
}

/**
 * Latest deliveries, newest first.
 *
 * The feed carries non-delivery events too (over summaries, partnership and
 * milestone markers); only actual balls are kept, identified by an `over.ball`
 * reference. Unlike the rest of crex's live data this endpoint returns plain
 * English, so nothing here is decoded — it is passed through.
 *
 * crex serves ~10 events per call, so this pages backwards with `lastDocId`
 * until it has MIN_BALLS deliveries. A page that adds nothing new ends the
 * walk, which is also what happens against a Worker too old to know the cursor
 * — it degrades to a single page rather than looping on it.
 */
export async function getCrexCommentary(
  matchKey: string,
  opts: FetchOpts = {}
): Promise<CommentaryBall[]> {
  return (await getCrexMatchFeed(matchKey, opts)).balls;
}

/** Deliveries and events from one walk of the feed, newest first. */
export interface CrexMatchFeed {
  balls: CommentaryBall[];
  events: MatchEvent[];
}

/**
 * Both halves of the ball feed in a single walk.
 *
 * The events and the deliveries come out of the same rows, so fetching them
 * separately would double the request count to say the same thing twice — and
 * risk a page showing a wicket in its event list that its own commentary has not
 * caught up with.
 */
export async function getCrexMatchFeed(
  matchKey: string,
  opts: FetchOpts = {}
): Promise<CrexMatchFeed> {
  const feed: CrexBallFeed[] = [];
  const seen = new Set<number>();
  let cursor = '';

  for (let page = 0; page < MAX_COMMENTARY_PAGES; page++) {
    const qs = new URLSearchParams({ matchKey });
    if (cursor) qs.set('lastDocId', cursor);

    const batch = await crexGet<CrexBallFeed[]>(`/match/commentary?${qs}`, {
      revalidate: 5,
      ...opts,
    });
    if (!batch?.length) break;

    // `id` is the cursor as well as the identity, so a page with no unseen ids
    // means there is nothing further back to ask for.
    const fresh = batch.filter((f) => f.id !== undefined && !seen.has(f.id));
    if (!fresh.length) break;

    for (const f of fresh) {
      seen.add(f.id as number);
      feed.push(f);
    }

    const balls = feed.filter(isDelivery).length;
    if (balls >= MIN_BALLS) break;

    cursor = String(batch[batch.length - 1].id ?? '');
    if (!cursor) break;
  }

  const balls = feed
    .filter(isDelivery)
    .map((f) => {
      const [over, ball] = String(f.o ?? '').split('.');
      const outcome = parseBallOutcome(f.b);
      // crex marks up its commentary — "<b>FOUR!!!</b>&nbsp;81.7 kph" — and the
      // UI renders text, so the tags and entities come out here rather than being
      // printed literally in the ball-by-ball list. Same treatment the event rows
      // already get; see `plainText`.
      const text = [plainText(f.c1), plainText(f.c2)].filter(Boolean).join(' — ');

      return {
        id: String(f.id ?? `${over}.${ball}`),
        // crex numbers an illegal delivery with the ball it will be re-bowled
        // as, so a wide never advances the count — the over.ball here is the
        // real one and needs no adjusting.
        over: Number(over) || 0,
        ball: Number(ball) || 0,
        runs: outcome.runs,
        batRuns: outcome.batRuns,
        extraRuns: outcome.extraRuns,
        extra: outcome.extra,
        isWicket: outcome.isWicket,
        isBoundary: outcome.batRuns === 4 || outcome.batRuns === 6,
        text,
        timestamp: f.id ? new Date(f.id).toISOString() : undefined,
      } satisfies CommentaryBall;
    })
    .filter((b) => Boolean(b.text));

  const events = feed
    .map(toMatchEvent)
    .filter((e): e is MatchEvent => e !== null);

  return { balls, events };
}

// ---------------------------------------------------------------------------
// Series
// ---------------------------------------------------------------------------

/**
 * A series' status from the statuses of its matches.
 *
 * "Live" here means the competition is under way, not that a ball is being
 * bowled right now. A league 35 matches into 44 sat under Upcoming on every
 * rest day, which is the wrong answer to the question the tab asks — so a
 * series that has played something and has something left is live. Upcoming is
 * reserved for one that has not started, and completed for one with nothing to
 * come.
 */
function seriesStatus(matches: Array<{ status: MatchStatus }>): MatchStatus {
  if (matches.some((m) => m.status === 'LIVE')) return 'LIVE';

  const toCome = matches.some((m) => m.status === 'UPCOMING');
  if (!toCome) return 'COMPLETED';

  return matches.some((m) => m.status === 'COMPLETED') ? 'LIVE' : 'UPCOMING';
}

/**
 * The single format label for a mixed list. A tour can run Tests and then ODIs;
 * the most common format is the fairest one label for the whole thing.
 */
function dominantFormat(matches: Array<{ format: MatchFormat }>): MatchFormat {
  const tally = new Map<MatchFormat, number>();
  for (const m of matches) tally.set(m.format, (tally.get(m.format) ?? 0) + 1);
  return [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/** How many of a list are finished — the other half of "12 of 34". */
const playedCount = (matches: Array<{ status: MatchStatus }>): number =>
  matches.filter((m) => m.status === 'COMPLETED').length;

/**
 * Roll the match list up into series.
 *
 * Cheap but partial: crex's match feed is a window (live, upcoming and recently
 * finished), not a season, so the count and the dates here describe *the matches
 * currently in the feed* — "2 matches, 12–14 August" for a tournament that runs
 * 34 across a month.
 *
 * Use it for grouping and for the status, then enrich with
 * `getCrexSeriesSchedule` for figures a reader would recognise. Everything the
 * UI shows as a total goes through that.
 */
export function seriesFromMatches(matches: Match[]): SeriesSummary[] {
  const groups = new Map<string, Match[]>();

  for (const m of matches) {
    const id = m.series?.id;
    if (!id) continue;
    const bucket = groups.get(id);
    if (bucket) bucket.push(m);
    else groups.set(id, [m]);
  }

  const summaries: SeriesSummary[] = [];

  for (const [id, list] of groups) {
    const times = list.map((m) => +new Date(m.startTime)).filter(Number.isFinite);

    summaries.push({
      id,
      name: list[0].series.name,
      format: dominantFormat(list),
      status: seriesStatus(list),
      matchCount: list.length,
      startDate: new Date(Math.min(...times)).toISOString(),
      endDate: new Date(Math.max(...times)).toISOString(),
    });
  }

  // Live series first, then upcoming, each by soonest start.
  const rank = { LIVE: 0, UPCOMING: 1, COMPLETED: 2 } as const;
  return summaries.sort(
    (a, b) => rank[a.status] - rank[b.status] || +new Date(a.startDate) - +new Date(b.startDate)
  );
}

// ---------------------------------------------------------------------------
// Series schedule — the whole competition, not the live window
// ---------------------------------------------------------------------------
//
// /series/matches answers what /matches/live cannot: every match in a series,
// including the ones that finished before the feed's window and the ones still
// weeks out. It is the only honest source for a series' span and match total.

/** One match as the series endpoint sends it, keyed by date ("2026/7/21"). */
export interface CrexSeriesMatch {
  /** Match f_key — the id /matches/{id} takes. Empty until crex allocates one. */
  mf: string;
  /**
   * crex's own row id, present on every row whether or not it has a match key.
   * It is what a still-unallocated fixture is addressed by — see
   * `scheduledMatchId`.
   */
  id?: number;
  /** Team 1 / team 2 keys. Resolve via /mapping `t`. */
  t1f?: string;
  t2f?: string;
  /** Venue key. */
  vf?: string;
  /** Match number within the series, "1" or "Final". */
  mn?: string;
  /** Start time, epoch ms. */
  t?: number;
  /** 0 upcoming, 1 live, 2 finished. */
  s?: number;
  /** Result text, once there is one. */
  r?: string;
  /** Format id: 1 ODI, 2 T20, 3 Test, 4 T10, 5 The Hundred. */
  ft?: number;
}

export type CrexSeriesMatchesResponse = Record<string, CrexSeriesMatch[]>;

/** Raw schedule for one series, grouped by date. */
export function getCrexSeriesMatches(
  seriesKey: string,
  opts: FetchOpts = {}
): Promise<CrexSeriesMatchesResponse> {
  return crexGet<CrexSeriesMatchesResponse>(
    `/series/matches?key=${encodeURIComponent(cleanKey(seriesKey))}`,
    { revalidate: 300, ...opts }
  );
}

/** `s` on a series match. Not the same vocabulary as `n` on a feed match. */
const SERIES_MATCH_STATUS: Record<number, MatchStatus> = {
  0: 'UPCOMING',
  1: 'LIVE',
  2: 'COMPLETED',
};

/**
 * Scheduled days a match of each format occupies.
 *
 * A series' end date is the last match's *start* plus this. Without it a two-Test
 * tour whose second Test begins on the 22nd reads as ending on the 22nd, when the
 * scheduled finish is the 26th — and crex's own series header says the 26th.
 */
const FORMAT_DAYS: Record<MatchFormat, number> = { TEST: 5, ODI: 1, T20: 1 };

/** `ft` on a series match. T10 and The Hundred fold into T20, as in toMatchFormat. */
const SERIES_MATCH_FORMAT: Record<number, MatchFormat> = {
  1: 'ODI',
  2: 'T20',
  3: 'TEST',
  4: 'T20',
  5: 'T20',
};

/**
 * A match the live feed has aged out, rebuilt from the endpoints keyed by match
 * rather than by window.
 *
 * `/matches/live` is the only endpoint that carries a whole match in one object,
 * and it is a rolling window: on now, next, just gone. Everything a reader might
 * actually click through to — an innings from a player's recent form, a Test
 * from a series that finished in May, a fixture from last month — is outside it,
 * and used to 404 for no better reason than that.
 *
 * Three calls, in a chain, because none of them is sufficient alone:
 *
 *   1. `/match/info`  is keyed by match and answers for any age. It has the
 *      squads and the venue but no teams-and-result summary — what it does have
 *      is `s`, the series key.
 *   2. `/series/matches` for that series lists every match in it with both
 *      sides, the venue, the match number, the status and the result text. That
 *      is the row this match's header is built from.
 *   3. `/match/scorecard` for the innings, so the page server-renders with a
 *      score rather than flashing an empty header until the client card lands.
 *
 * Every one is edge-cached for five minutes or more, and this only runs when the
 * feed misses, so a live match still costs exactly one request.
 *
 * Two fields the feed has and this cannot: `note` (there is no in-play state to
 * report on a finished match) and `playerOfMatch` (crex sends the award only on
 * the feed object). Both come back null rather than guessed at.
 */
async function getCrexArchivedMatch(id: string, opts: FetchOpts = {}): Promise<Match | null> {
  const key = cleanKey(id);
  if (!key) return null;

  // The caller's freshness window is the live one — /matches/[id] asks for five
  // seconds, because a match in progress moves that fast. Nothing on this path
  // does: it only runs for a match the feed has already let go of. So the
  // caller's `revalidate` is dropped and each endpoint keeps its own, while the
  // abort signal still passes through.
  const archived: FetchOpts = { signal: opts.signal };

  const info = await crexGet<CrexMatchInfo>(`/match/info?key=${encodeURIComponent(key)}`, {
    ...archived,
    revalidate: 3600,
  }).catch(() => null);

  const seriesKey = cleanKey(info?.s);
  if (!seriesKey) return null;

  const schedule = await getCrexSeriesMatches(seriesKey, archived).catch(() => null);
  const row = Object.values(schedule ?? {})
    .flat()
    .find((m) => m?.mf === key);
  if (!row) return null;

  const names = await resolveKeys(
    {
      t: [row.t1f ?? '', row.t2f ?? ''],
      v: [row.vf ?? '', info?.v ?? ''],
      s: [seriesKey],
    },
    archived
  );

  const homeTeam = toTeam(row.t1f ?? '', names);
  const awayTeam = toTeam(row.t2f ?? '', names);
  const status = SERIES_MATCH_STATUS[row.s ?? 0] ?? 'UPCOMING';
  const hundred = row.ft === HUNDRED_FORMAT;
  const perOver = hundred ? HUNDRED_BALLS_PER_OVER : DEFAULT_BALLS_PER_OVER;

  // A match that has not started has no card to fetch — crex does not open an
  // innings slot until the first ball.
  const innings =
    status === 'UPCOMING'
      ? []
      : await getCrexScorecard(key, {
          ...archived,
          revalidate: 3600,
          ballsPerOver: perOver,
          status,
        }).catch(() => []);

  const startedAt = row.t ?? (info?.dt ? Date.parse(info.dt) : NaN);

  return {
    id: key,
    homeTeam,
    awayTeam,
    series: { id: seriesKey, name: names.s.get(seriesKey)?.n ?? 'Cricket' },
    format: SERIES_MATCH_FORMAT[row.ft ?? 0] ?? 'T20',
    status,
    venue: names.v.get(cleanKey(row.vf || info?.v))?.n ?? 'TBD',
    venueId: cleanKey(row.vf || info?.v) || null,
    startTime: new Date(Number.isFinite(startedAt) ? startedAt : Date.now()).toISOString(),
    ballsPerOver: perOver,
    ballsLimit: hundred ? HUNDRED_BALLS : null,
    result: row.r || null,
    note: null,
    day: null,
    playerOfMatch: null,
    scorecard: innings.length ? { innings } : null,
  };
}

/**
 * Ids for a scheduled match crex has not allocated a match key to yet.
 *
 * crex only mints a match key (`mf`) a day or two before the match; everything
 * further out arrives with an empty one. Those rows used to render inert —
 * present in a schedule, not openable — which is wrong on the reader's terms: an
 * announced Test at Lord's three weeks out is exactly the fixture someone wants
 * the page for, and the schedule row already carries the sides, the ground and
 * the start time.
 *
 * So a fixture is addressed by the two things crex *does* give it: the series it
 * belongs to and its row id inside that series' schedule. `/matches/fx-2BG-47478`
 * is that pair, and `getCrexScheduledMatch` reads the row back out of
 * /series/matches. The `fx-` prefix keeps these apart from real match keys, which
 * are upper-case alphanumerics with no separator.
 *
 * The id is stable for as long as the fixture is unallocated, and the moment crex
 * does allocate a key /matches/[id] redirects to it — see the route.
 */
const SCHEDULED_ID_PREFIX = 'fx-';

/** The preview id for one row of a series schedule. */
export function scheduledMatchId(
  seriesKey: string | undefined,
  rowId: string | number | null | undefined
): string {
  return `${SCHEDULED_ID_PREFIX}${cleanKey(seriesKey)}-${rowId ?? ''}`;
}

/** The series and row an `fx-` id names, or null if this is not one. */
export function parseScheduledMatchId(
  id: string
): { seriesKey: string; rowId: string } | null {
  if (!id.startsWith(SCHEDULED_ID_PREFIX)) return null;
  const [seriesKey, rowId] = id.slice(SCHEDULED_ID_PREFIX.length).split('-');
  if (!seriesKey || !rowId) return null;
  return { seriesKey: cleanKey(seriesKey), rowId };
}

/**
 * One unallocated fixture, rebuilt from its series' schedule.
 *
 * Everything a preview needs is on the row — both sides, the ground, the start
 * time, the format, the match number — and nothing else can be had: there is no
 * card, no feed and no squad list for a match crex has no key for. So this
 * returns the header and lets the match page render its upcoming state around
 * it, which is the same state it already renders for a keyed fixture.
 *
 * `id` comes back as the *real* match key when crex has allocated one since the
 * link was rendered. The route reads that and redirects, so a preview link never
 * outlives the preview.
 */
export async function getCrexScheduledMatch(
  id: string,
  opts: FetchOpts = {}
): Promise<Match | null> {
  const parsed = parseScheduledMatchId(id);
  if (!parsed) return null;
  const { seriesKey, rowId } = parsed;

  // The caller's freshness window is the live one (five seconds — see the
  // route). A fixture weeks out does not move at that rate, so the endpoint
  // keeps its own window and only the abort signal passes through.
  const scheduled: FetchOpts = { signal: opts.signal };

  const schedule = await getCrexSeriesMatches(seriesKey, scheduled).catch(() => null);
  const row = Object.values(schedule ?? {})
    .flat()
    .find((m) => m && String(m.id ?? '') === rowId);
  if (!row?.t) return null;

  const names = await resolveKeys(
    { t: [row.t1f ?? '', row.t2f ?? ''], v: [row.vf ?? ''], s: [seriesKey] },
    scheduled
  );

  const hundred = row.ft === HUNDRED_FORMAT;

  return {
    id: cleanKey(row.mf) || id,
    homeTeam: toTeam(row.t1f ?? '', names),
    awayTeam: toTeam(row.t2f ?? '', names),
    series: { id: seriesKey, name: names.s.get(seriesKey)?.n ?? 'Cricket' },
    format: SERIES_MATCH_FORMAT[row.ft ?? 0] ?? 'T20',
    status: SERIES_MATCH_STATUS[row.s ?? 0] ?? 'UPCOMING',
    venue: names.v.get(cleanKey(row.vf))?.n ?? 'TBD',
    venueId: cleanKey(row.vf) || null,
    startTime: new Date(row.t).toISOString(),
    ballsPerOver: hundred ? HUNDRED_BALLS_PER_OVER : DEFAULT_BALLS_PER_OVER,
    ballsLimit: hundred ? HUNDRED_BALLS : null,
    result: row.r || null,
    note: null,
    day: null,
    playerOfMatch: null,
    scorecard: null,
  };
}

/** One row of a series' schedule, with keys resolved to names. */
export interface SeriesScheduleMatch {
  /**
   * What /matches/{id} takes for this row — the match key where crex has
   * allocated one, and the `fx-` preview id where it has not. Always openable:
   * an unallocated fixture is a preview, not a dead row.
   */
  id: string;
  /**
   * The real match key, or null on a fixture crex has not allocated one to yet.
   * The flag for anything that needs the match's *own* endpoints — a scorecard,
   * a feed, a squad list — none of which exist before the key does.
   */
  matchKey: string | null;
  /** Stable list key: the match key, or its slot in the schedule. */
  key: string;
  /** "1", "Final", or null when crex has not numbered it. */
  matchNo: string | null;
  format: MatchFormat;
  status: MatchStatus;
  startTime: string;
  venue: string;
  /** Venue f_key, so a schedule row's ground is a link. Null on a "TBD". */
  venueId: string | null;
  result: string | null;
  homeTeam: Team;
  awayTeam: Team;
}

export interface SeriesSchedule extends SeriesSummary {
  /** Every match in the series, earliest first. */
  matches: SeriesScheduleMatch[];
  /** How many are done — the other half of "12 of 34". */
  playedCount: number;
}

/** The day a match is scheduled to finish on, as an ISO string. */
function lastDay(match: SeriesScheduleMatch): string {
  const days = FORMAT_DAYS[match.format] - 1;
  if (!days) return match.startTime;
  return new Date(+new Date(match.startTime) + days * 86_400_000).toISOString();
}

/**
 * A series' full schedule: real start and end dates, a real match total, and
 * every fixture in order.
 *
 * `fallback` supplies the name and format when the mapping has no entry for the
 * series key, which is why the feed-derived summary is worth passing in.
 * Returns null when crex lists no matches for the key at all.
 */
export async function getCrexSeriesSchedule(
  seriesKey: string,
  opts: FetchOpts & { fallback?: SeriesSummary } = {}
): Promise<SeriesSchedule | null> {
  const id = cleanKey(seriesKey);
  const raw = await getCrexSeriesMatches(id, opts);

  // A start time is the only field this needs: `mf` is missing on unallocated
  // fixtures and requiring it undercounts a league by its whole playoff stage
  // (7 of the CPL's 39 matches have keys today), which is exactly the wrong
  // number to report as a total.
  const rows = Object.values(raw ?? {})
    .flat()
    .filter((m): m is CrexSeriesMatch & { t: number } => Boolean(m?.t))
    .sort((a, b) => a.t - b.t);
  if (!rows.length) return null;

  const names = await resolveKeys(
    {
      t: rows.flatMap((m) => [m.t1f ?? '', m.t2f ?? '']),
      v: rows.map((m) => m.vf ?? ''),
      s: [id],
    },
    opts
  );

  const matches: SeriesScheduleMatch[] = rows.map((m, i) => ({
    id: m.mf || scheduledMatchId(id, m.id),
    matchKey: m.mf || null,
    key: m.mf || `${id}-${i}`,
    // crex sometimes sends the number in its encoded form ("^0"), which is not a
    // number and not worth decoding for a list index.
    matchNo: m.mn && !m.mn.startsWith('^') ? m.mn : null,
    format: SERIES_MATCH_FORMAT[m.ft ?? 0] ?? opts.fallback?.format ?? 'T20',
    status: SERIES_MATCH_STATUS[m.s ?? 0] ?? 'UPCOMING',
    startTime: new Date(m.t).toISOString(),
    venue: names.v.get(cleanKey(m.vf))?.n ?? 'TBD',
    venueId: cleanKey(m.vf) || null,
    result: m.r || null,
    homeTeam: toTeam(m.t1f ?? '', names),
    awayTeam: toTeam(m.t2f ?? '', names),
  }));

  return {
    id,
    name: names.s.get(id)?.n ?? opts.fallback?.name ?? 'Cricket',
    format: dominantFormat(matches),
    status: seriesStatus(matches),
    matchCount: matches.length,
    playedCount: playedCount(matches),
    // Rows are sorted, so the span runs from the first match's start to the last
    // one's scheduled finish.
    startDate: matches[0].startTime,
    endDate: lastDay(matches[matches.length - 1]),
    matches,
  };
}

/**
 * A schedule assembled from the live feed instead of the series endpoint.
 *
 * The narrow view — only the matches inside the feed's window, so the span and
 * the total are the feed's, not the season's. It exists as a fallback: a series
 * page built solely on /series/matches would 404 outright whenever that endpoint
 * is unreachable, and a short schedule beats no page.
 */
export function seriesScheduleFromMatches(
  seriesId: string,
  matches: Match[]
): SeriesSchedule | null {
  const id = cleanKey(seriesId);
  const mine = matches
    .filter((m) => m.series?.id === id)
    .sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime));

  const summary = seriesFromMatches(mine)[0];
  if (!summary) return null;

  return {
    ...summary,
    playedCount: playedCount(mine),
    matches: mine.map((m) => ({
      id: m.id,
      matchKey: m.id,
      key: m.id,
      matchNo: null,
      format: m.format,
      status: m.status,
      startTime: m.startTime,
      venue: m.venue,
      venueId: m.venueId ?? null,
      result: m.result ?? null,
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
    })),
  };
}

/**
 * Correct a schedule's per-match statuses from the live feed, then re-derive the
 * series status and played count from the result.
 *
 * Both sources are wrong on their own. The schedule's `s` is up to five minutes
 * stale, so a finished match can still read as live. The feed is current but only
 * covers a window, so a tour whose one listed match has just finished looks over
 * even with a Test still to come — which is exactly how "Bangladesh tour of
 * Australia" came out as COMPLETED with a match left on the 22nd.
 *
 * Taking each match's status from the feed when the feed has it, and the series'
 * status from the whole corrected list, is right in both directions.
 */
export function withFeedStatuses(schedule: SeriesSchedule, feed: Match[]): SeriesSchedule {
  const fresh = new Map(
    feed.filter((m) => m.series.id === schedule.id).map((m) => [m.id, m.status])
  );

  const matches = fresh.size
    ? schedule.matches.map((m) => {
        const current = m.matchKey ? fresh.get(m.matchKey) : undefined;
        return current && current !== m.status ? { ...m, status: current } : m;
      })
    : schedule.matches;

  return {
    ...schedule,
    matches,
    status: seriesStatus(matches),
    playedCount: playedCount(matches),
  };
}

// ---------------------------------------------------------------------------
// Fixtures (the full schedule)
// ---------------------------------------------------------------------------
//
// /matches/live is a rolling window — live now, next up, just gone — so the
// upcoming slice of it is a couple of days deep at best. /fixtures is crex's own
// schedule page: date-wise, 20 matches a page, page 0 starting today and each
// further page another two or three days forward. Fetching a handful of pages is
// what turns "the next eight matches" into a real fixtures list.

/** One scheduled match as /fixtures (wise=1) sends it. */
export interface CrexFixtureRow {
  /**
   * Match f_key — the id /matches/{id} takes. Absent on most future fixtures:
   * crex allocates the key close to the match, so anything more than a few days
   * out is linked by its `fx-` preview id instead (see `scheduledMatchId`).
   */
  mf?: string;
  /** crex's own row id. Always present, so it is what keys the list. */
  id?: number;
  /** Team 1 / team 2 keys. Resolve via /mapping `t`. */
  t1f?: string;
  t2f?: string;
  /** Series key. */
  sf?: string;
  /** Venue key. */
  vf?: string;
  /** Match number within the series; sometimes crex-encoded ("^0"). */
  mn?: string;
  /** Start time, epoch ms. */
  t?: number;
  /** 0 upcoming, 1 live, 2 finished — the same vocabulary as /series/matches. */
  status?: number;
  /** Format id: 1 ODI, 2 T20, 3 Test, 4 T10, 5 The Hundred. */
  ft?: number;
  /** Format label ("T20I", "One Day"). `ft` is the reliable one; this is a fallback. */
  fo?: string;
  /** Team 1 / team 2 score, "170/9". Only on live and finished rows. */
  s1?: string;
  s2?: string;
  /** Overs faced, "20.0". */
  o1?: string;
  o2?: string;
  /** Result text once there is one. */
  result?: string;
}

/**
 * A scheduled match, in our vocabulary.
 *
 * A `Match` plus the one thing the schedule cannot promise: `matchKey` is the
 * crex id when crex has allocated one and null otherwise, so anything that needs
 * the match's own endpoints — card, feed, squads — knows whether they exist. `id`
 * is always a page: the match key, or the `fx-` preview id built from the series
 * and the row (see `scheduledMatchId`).
 */
export interface Fixture extends Match {
  matchKey: string | null;
}

/** One page of the schedule, date-wise. Page 0 starts today; negative is past. */
export function getCrexFixtures(page = 0, opts: FetchOpts = {}): Promise<CrexFixtureRow[]> {
  return crexGet<CrexFixtureRow[]>(`/fixtures?wise=1&page=${page}`, {
    revalidate: 300,
    ...opts,
  });
}

/** 20 rows a page, and crex 400s well before this — see the Worker's route. */
const FIXTURE_PAGES = 12;

/** An innings of The Hundred, in balls per over. `ft` 5 is the only signal here. */
const HUNDRED_FORMAT = 5;

function toFixture(row: CrexFixtureRow, names: typeof nameCache): Fixture {
  const homeTeam = toTeam(row.t1f ?? '', names);
  const awayTeam = toTeam(row.t2f ?? '', names);
  const seriesKey = cleanKey(row.sf);
  const matchKey = cleanKey(row.mf) || null;
  const status = SERIES_MATCH_STATUS[row.status ?? 0] ?? 'UPCOMING';
  const hundred = row.ft === HUNDRED_FORMAT;

  const innings = [
    parseScore(row.s1 && row.o1 ? `${row.s1}(${row.o1}` : row.s1, homeTeam.shortName),
    parseScore(row.s2 && row.o2 ? `${row.s2}(${row.o2}` : row.s2, awayTeam.shortName),
  ].filter((i): i is InningsScore => i !== null);

  return {
    id: matchKey ?? scheduledMatchId(seriesKey, row.id),
    matchKey,
    homeTeam,
    awayTeam,
    series: { id: seriesKey, name: names.s.get(seriesKey)?.n ?? 'Cricket' },
    format: SERIES_MATCH_FORMAT[row.ft ?? 0] ?? 'T20',
    status,
    venue: names.v.get(cleanKey(row.vf))?.n ?? 'TBD',
    venueId: cleanKey(row.vf) || null,
    startTime: new Date(row.t ?? Date.now()).toISOString(),
    ballsPerOver: hundred ? HUNDRED_BALLS_PER_OVER : DEFAULT_BALLS_PER_OVER,
    ballsLimit: hundred ? HUNDRED_BALLS : null,
    result: status === 'COMPLETED' ? row.result ?? null : null,
    scorecard: innings.length ? { innings } : null,
  };
}

/**
 * The schedule ahead: every match crex lists from today forward, earliest first.
 *
 * Pages are fetched in parallel and each is independently edge-cached, so a page
 * that fails costs its own 20 rows and not the list. Rows are deduped on the way
 * out — page boundaries fall mid-day, and crex repeats a day's tail on the next
 * page often enough to matter.
 */
export function getCrexFixtureList(opts: FetchOpts & { pages?: number } = {}): Promise<Fixture[]> {
  const pages = opts.pages ?? FIXTURE_PAGES;
  return fixturesFromPages(
    Array.from({ length: pages }, (_, page) => page),
    opts
  );
}

/**
 * The schedule *behind* today as well as ahead of it — the corpus the derived
 * pages (a venue's record, a side's form, a head-to-head) are read out of.
 *
 * crex publishes no endpoint for any of those. What it does publish is a
 * schedule whose finished rows carry the scores and the result sentence, so the
 * only way to answer "what has happened at this ground" is to hold a window of
 * that schedule and filter it. This is that window.
 *
 * `back` and `forward` are page counts, not days: a page is 20 matches, which is
 * a little over a day of listed cricket worldwide. The defaults are deliberately
 * the *same* for every caller — every page share the same cache entries that
 * way, so the second derived page in a session costs almost nothing.
 */
export function getCrexFixtureRange(
  opts: FetchOpts & { back?: number; forward?: number } = {}
): Promise<Fixture[]> {
  const back = opts.back ?? CORPUS_BACK;
  const forward = opts.forward ?? CORPUS_FORWARD;
  const pages: number[] = [];
  for (let p = -back; p <= forward; p++) pages.push(p);
  return fixturesFromPages(pages, { revalidate: CORPUS_REVALIDATE, ...opts });
}

/**
 * Pages behind today, and pages ahead, for the derived corpus.
 *
 * Sized by what the pages built on it need rather than by what is available: a
 * ground hosts a handful of matches a month and two sides in the same league meet
 * two or three times a season, so a record worth printing needs weeks. A page is
 * a little over a day of listed cricket worldwide, which puts this at roughly
 * seven weeks back — enough for a venue to have a dozen results and for two
 * league sides to have met more than once.
 *
 * `back` stops short of the Worker's ±60 bound rather than reaching it: the pages
 * are fetched in parallel, and the last ten cost the same as the first ten while
 * adding matches old enough that a "recent form" strip built on them would be
 * describing a different squad.
 */
const CORPUS_BACK = 45;
const CORPUS_FORWARD = 12;

/**
 * Half an hour. Longer than the schedule's own 5-minute TTL on purpose — nothing
 * read out of this corpus is live. A result from three weeks ago does not change,
 * and the one match that might have finished in the last half hour changes a
 * venue's chase/defend split by one.
 */
const CORPUS_REVALIDATE = 1800;

/**
 * How many schedule pages may be in flight at once.
 *
 * The corpus is 58 pages wide, and firing all 58 the moment a match, team or
 * venue page renders put a 58-request burst on the Worker for every cold read —
 * from a single visitor. Cached reads are free either way, so the only thing
 * the unbounded version bought was a slightly faster cache miss, at the cost of
 * being the app's own worst traffic spike. Same width the series stat tables
 * use for the same reason.
 */
const FIXTURE_FETCH_WIDTH = 8;

async function fixturesFromPages(pages: number[], opts: FetchOpts = {}): Promise<Fixture[]> {
  const settled = await inWidth(pages, FIXTURE_FETCH_WIDTH, (page) =>
    getCrexFixtures(page, opts).catch(() => [] as CrexFixtureRow[])
  );

  // Both keys are needed: `id` is crex's row id and `mf` the match key, and a row
  // can arrive on two pages carrying one of them and then both.
  const seen = new Set<string>();
  const rows: CrexFixtureRow[] = [];
  for (const row of settled.flat()) {
    if (!row?.t || !cleanKey(row.t1f) || !cleanKey(row.t2f)) continue;
    const key = cleanKey(row.mf) || `id-${row.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
  }

  const names = await resolveKeys(
    {
      t: rows.flatMap((r) => [r.t1f ?? '', r.t2f ?? '']),
      v: rows.map((r) => r.vf ?? ''),
      s: rows.map((r) => r.sf ?? ''),
    },
    opts
  );

  return rows
    .map((r) => toFixture(r, names))
    .sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime));
}

/**
 * Enrich feed-derived summaries with their real spans, totals and statuses.
 *
 * One request per series, in parallel — they are independent, edge-cached for
 * five minutes apiece, and a series whose schedule fails to load keeps its
 * feed-derived figures rather than dropping off the page.
 */
export async function withSeriesSchedules(
  summaries: SeriesSummary[],
  feed: Match[],
  opts: FetchOpts = {}
): Promise<SeriesSummary[]> {
  const schedules = await Promise.all(
    summaries.map((s) =>
      getCrexSeriesSchedule(s.id, { ...opts, fallback: s }).catch(() => null)
    )
  );

  return summaries.map((s, i) => {
    const full = schedules[i];
    if (!full) return s;
    const { matches: _matches, ...summary } = withFeedStatuses(full, feed);
    return summary;
  });
}

// ---------------------------------------------------------------------------
// Player profiles
// ---------------------------------------------------------------------------
//
// `/player/overview?key=<pf>` — a whole career in one call, keyed by the same
// player f_key the scorecard, the squads and the ranking lists already carry.
//
// The payload is the most nested thing crex serves, and the decode below is
// mostly about two of its habits:
//
//   1. **A format is a pair of codes, never a name.** Every career and form row
//      carries `st` (which competition) and a format code — `ft` on career rows,
//      `mt` on form rows — and only both together say "Test" or "PSL". See
//      `playerFormatLabel`.
//   2. **The bio is Google-Docs HTML.** Inline font stacks, `<span>` soup,
//      colours that fight the theme. `sanitizeBio` keeps the structure and
//      throws away every attribute.

/** crex's illustrated player portraits, keyed by the same f_key. */
const PLAYER_IMAGE_BASE = 'https://cricketvectors.akamaized.net/players/org';

/** Basic info — crex's `a.bsi`. Only the fields the profile page reads. */
interface CrexPlayerBasic {
  /** Full name. */
  fn?: string;
  /** Date of birth, epoch ms. */
  dob?: number | null;
  /** Date of death — set on retired-and-since-died players. */
  dod?: number | null;
  /** Place of birth, free text. */
  pob?: string;
  /** Height, crex's own wording: "5 ft 10 in". */
  h?: string;
  /** Nationality as an adjective — "Pakistani", not "Pakistan". */
  n?: string;
  /** Bio, as HTML. */
  p?: string;
  /** Every team they have played for, comma-separated. */
  tm?: string;
  /** Instagram handle. */
  iu?: string;
  /** Twitter handle, sometimes with the leading @. */
  tu?: string;
  /** Role: 0 keeper, 1 batter, 3 bowler, anything else all-rounder. */
  rl?: number;
  /** Batting hand, lowercase: "right handed". */
  bts?: string;
  /** Batting position: "opener", "middle order". */
  bp?: string;
  /** Bowling type: "right-arm offbreak". Literally "na" for a non-bowler. */
  bwl?: string;
  /** Bowling style: 1 pace, 2 spin, -1 unknown. */
  bs?: number;
  /** Popular shot. Almost always empty. */
  ps?: string;
  /** Gender: 0 men, 1 women. */
  g?: number;
}

/** One career row — batting or bowling, for one competition and format. */
interface CrexCareerRow<S> {
  /** Competition code. 1 is international; the rest are leagues. */
  st: number;
  /** Format code, read together with `st`. */
  ft: number;
  s: S;
}

/**
 * A match referenced from inside a career row — the innings a highest score was
 * made in, or the debut. Only `mf` is read; crex sends a dozen more fields
 * (team keys, the numeric match_id, the series) that duplicate what the match
 * page fetches for itself.
 */
interface CrexCareerMatchRef {
  /** Match f_key. */
  mf?: string;
}

interface CrexBattingStats {
  m?: number;
  i?: number;
  r?: number;
  /** Hundreds. */
  hd?: number;
  /** Fifties. */
  ff?: number;
  /** Highest score. */
  hs?: number;
  sr?: number;
  av?: number;
  /** Fours. */
  fr?: number;
  /** Sixes. */
  sx?: number;
  /**
   * Ducks. crex's own profile page reads `dk` here and so prints "--" for
   * everyone: the field on the wire is `du`. Both are read, `du` first.
   */
  du?: number;
  dk?: number;
  /** The innings the highest score was made in. */
  hsm?: CrexCareerMatchRef | null;
  /** Batting debut, as prose. */
  btd?: string;
  /** The debut match itself. Null on the leagues crex has not keyed. */
  btdm?: CrexCareerMatchRef | null;
}

interface CrexBowlingStats {
  m?: number;
  i?: number;
  w?: number;
  /** Best innings figures, "5/23". Empty string when they have none. */
  bf?: string;
  /** Economy. */
  ec?: number;
  w3?: number;
  w5?: number;
  /** Bowling average. */
  bav?: number;
  /** Bowling strike rate. */
  bsr?: number;
  /** Bowling debut, as prose. */
  bod?: string;
  /** The debut match itself. */
  bodm?: CrexCareerMatchRef | null;
}

/** One of the last ten innings — crex's `c.btf` / `c.bof`. */
interface CrexFormRow {
  /** Batting: runs scored. Bowling: runs conceded. */
  r?: number;
  /** Batting: balls faced. Bowling: wickets taken. */
  b?: number;
  /** Batting only: 1 dismissed, 0 not out. */
  di?: number;
  /** Match key. */
  mf?: string;
  /** Competition code. */
  st?: number;
  /** Match-type code — the format half of the label on a form row. */
  mt?: number;
  /** Start time, epoch ms. */
  dt?: number;
  /** The opposition's team key. */
  vs?: string;
  t1f?: string;
  t2f?: string;
}

/** The whole profile payload. `t` (social embeds) is deliberately not typed. */
interface CrexPlayerOverview {
  a?: {
    bsi?: CrexPlayerBasic;
    sts?: {
      bt?: CrexCareerRow<CrexBattingStats>[];
      bl?: CrexCareerRow<CrexBowlingStats>[];
    };
  };
  /** ICC ranking positions. `type` is the discipline, `ft` the format. */
  b?: Array<{ ft: number; pos: number; type: number }>;
  c?: { btf?: CrexFormRow[]; bof?: CrexFormRow[] };
  /** Teams under contract. `st` arrives as a string here, unlike everywhere else. */
  d?: Array<{ tf?: string; st?: string | number; ft?: number }>;
}

/**
 * Competition labels for the codes `playerFormatLabel` falls through to.
 *
 * crex's own table, transcribed from their profile chunk. The odd entries are
 * theirs: `1` is T20I rather than a league because international T20 shares the
 * competition code with everything else international, and `18` is the Hundred
 * under its scoring name.
 */
/**
 * The competition codes that are senior international cricket.
 *
 * 1 is bilateral international — Test, ODI and T20I all share it — and 100 is
 * the ODI World Cup, which crex files as its own competition. Everything else in
 * `PLAYER_COMPETITIONS` is domestic or franchise: First class and List A, the
 * IPL, the PSL, the Hundred, the Blast. Under-19 is left out deliberately: crex
 * uses one code for age-group cricket at every level, so it cannot be called.
 */
const INTERNATIONAL_COMPETITIONS = new Set([1, 100]);

const PLAYER_COMPETITIONS: Record<number, string> = {
  1: 'T20I',
  2: 'First class',
  3: 'List A',
  4: 'T20',
  5: 'IPL',
  6: 'BBL',
  7: 'CPL',
  8: 'NPL',
  9: 'BPL',
  10: 'Abu Dhabi T10',
  11: 'PSL',
  12: 'QPL',
  14: 'VPL',
  15: 'D. T10',
  16: 'TNPL',
  17: 'KPL',
  18: '100B',
  19: 'Under 19',
  20: 'T20-Blast',
  21: 'The 6IXTY',
  100: 'WC ODI',
};

/**
 * The label for a (competition, format) pair — the one piece of crex's player
 * vocabulary that is not guessable.
 *
 * Neither code means anything alone. `ft` names the shape of the game and `st`
 * the competition it was played in, and which of the two wins depends on the
 * combination: `st=1, ft=3` is a Test, but `st=2, ft=3` is List A cricket, and
 * `st=1, ft=2` is a T20I while `st=5, ft=2` is an IPL match. This is a
 * transcription of crex's `seriesFormatDecision`, branch order included —
 * reordering it silently relabels careers.
 *
 * Returns null for a pair crex has no name for, which the UI drops rather than
 * printing a code at the reader.
 */
export function playerFormatLabel(st: number, ft: number): string | null {
  if (ft === 1 && st !== 3 && st !== 100) return 'ODI';
  if (ft === 2 && (st === 2 || st === 3 || st === 10)) return 'T20';
  if (ft === 3 && st !== 2) return 'Test';
  if (ft === 4 && st !== 10 && st !== 12 && st !== 14 && st !== 15 && st !== 16) return 'T10';
  if (ft === 5) return '100B';
  return PLAYER_COMPETITIONS[st] ?? null;
}

/** crex's role codes. 2 only ever appears on a ranking row, 3 only on a player. */
function playerRole(code: number | undefined): PlayerRoleLabel {
  if (code === 1) return 'Batter';
  if (code === 3) return 'Bowler';
  if (code === 0) return 'Wicket-keeper';
  return 'All Rounder';
}

/** The discipline a ranking list is for. Its codes are not the player's. */
function rankingDiscipline(code: number): PlayerRanking['discipline'] {
  if (code === 1) return 'Batter';
  if (code === 2) return 'Bowler';
  return 'All Rounder';
}

/**
 * Tags kept when the bio is sanitised. Structure only: paragraphs, headings,
 * emphasis and lists. No links — crex's bios link back into their own site.
 */
const BIO_TAGS = new Set([
  'p',
  'br',
  'h2',
  'h3',
  'h4',
  'strong',
  'b',
  'em',
  'i',
  'ul',
  'ol',
  'li',
  'blockquote',
]);

/**
 * crex's bio HTML, reduced to text and a few structural tags.
 *
 * It arrives pasted out of Google Docs: `<span style="font-family: Arial; color:
 * rgb(0,0,0)">` around every sentence, `docs-internal-guid` ids, hard-coded
 * black on a theme that is sometimes dark. Rather than allowlist attributes, this
 * drops all of them and every tag outside `BIO_TAGS`, keeping the text those tags
 * wrapped. What survives inherits our own typography, and there is nothing left
 * for a script or a style block to hide in.
 */
export function sanitizeBio(html: string | undefined): string | null {
  if (!html) return null;

  const clean = html
    // Script and style bodies go with their tags — stripping the tag alone would
    // dump their contents into the page as text.
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(\/?)([a-z0-9]+)\b[^>]*>/gi, (_match, slash: string, name: string) => {
      const tag = name.toLowerCase();
      return BIO_TAGS.has(tag) ? `<${slash}${tag}>` : '';
    })
    // crex leaves empty paragraphs behind between sections.
    .replace(/<p>(\s|&nbsp;)*<\/p>/gi, '')
    .trim();

  return clean.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() ? clean : null;
}

/** Whole years since a date of birth. */
function ageFrom(dob: number | null | undefined): number | null {
  if (!dob) return null;
  const born = new Date(dob);
  const now = new Date();
  let age = now.getUTCFullYear() - born.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - born.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < born.getUTCDate())) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

/**
 * "right handed · opener" from crex's two fields, either of which can be empty.
 *
 * `bwl` is "na" on a player who does not bowl — a real value in the payload
 * rather than an absent one, so it is checked for by name.
 */
function joinTrait(...parts: Array<string | undefined>): string | null {
  const kept = parts
    .map((p) => (p ?? '').trim())
    .filter((p) => p && p.toLowerCase() !== 'na' && p !== '-1');
  return kept.length ? kept.join(' · ') : null;
}

/** Bowling style, spelled out. -1 is crex's "not recorded". */
function bowlingStyle(code: number | undefined): string | undefined {
  if (code === 1) return 'pacer';
  if (code === 2) return 'spinner';
  return undefined;
}

/**
 * One form entry. The two disciplines share a row shape and read differently:
 * batting is runs off balls, bowling is wickets for runs, and crex puts the
 * wickets in `b` — the same field that holds balls faced on a batting row.
 */
function toFormEntry(
  row: CrexFormRow,
  discipline: 'batting' | 'bowling',
  names: typeof nameCache
): PlayerFormEntry {
  const runs = row.r ?? 0;
  const balls = row.b ?? 0;
  // `vs` is the opposition, so the player's own side is whichever of the two
  // team keys it is not.
  const opponent = cleanKey(row.vs);
  const own = cleanKey(row.t1f) === opponent ? cleanKey(row.t2f) : cleanKey(row.t1f);
  const label = (key: string) => names.t.get(key)?.sn ?? names.t.get(key)?.n ?? key;

  return {
    figures: discipline === 'batting' ? `${runs} (${balls})` : `${balls}-${runs}`,
    notOut: discipline === 'batting' && row.di === 0,
    fixture: `${label(own)} vs ${label(opponent)}`,
    format: playerFormatLabel(Number(row.st), Number(row.mt)),
    matchId: cleanKey(row.mf) || null,
    date: row.dt ? new Date(row.dt).toISOString() : null,
  };
}

/**
 * Everything crex knows about one player, decoded.
 *
 * Two requests: the profile itself, then one /mapping call for the teams its
 * form rows and contracts reference. The player's own name comes from the same
 * mapping bucket only as a fallback — `a.bsi.fn` is the fuller spelling
 * ("Imam-ul-Haq" rather than a truncation), so it wins when present.
 *
 * Returns null on a key crex does not know, which is what the route 404s on.
 */
export async function getCrexPlayerProfile(
  key: string,
  opts: FetchOpts = {}
): Promise<PlayerProfile | null> {
  const id = cleanKey(key);
  if (!id) return null;

  const raw = await crexGet<CrexPlayerOverview>(`/player/overview?key=${encodeURIComponent(id)}`, {
    revalidate: 3600,
    ...opts,
  });

  const basic = raw.a?.bsi;
  // crex answers an unknown key with a well-formed envelope and nothing in it.
  if (!basic?.fn) return null;

  const batting = raw.a?.sts?.bt ?? [];
  const bowling = raw.a?.sts?.bl ?? [];
  const recentBatting = raw.c?.btf ?? [];
  const recentBowling = raw.c?.bof ?? [];
  const contracts = raw.d ?? [];

  const names = await resolveKeys(
    {
      t: [
        ...recentBatting.flatMap((r) => [r.t1f ?? '', r.t2f ?? '', r.vs ?? '']),
        ...recentBowling.flatMap((r) => [r.t1f ?? '', r.t2f ?? '', r.vs ?? '']),
        ...contracts.map((c) => c.tf ?? ''),
      ].filter(Boolean),
      p: [id],
    },
    opts
  );

  // The national side, for the crest beside the name: st=1 is crex's
  // international competition code, and a player has one row per format under it.
  const national = contracts.find((c) => Number(c.st) === 1)?.tf;
  const countryKey = cleanKey(national) || null;

  // Debuts are per format, and the same fixture appears on both disciplines'
  // rows — one entry each, batting's wording preferred because a specialist
  // bowler's batting row still carries the match they debuted in.
  const debuts: PlayerDebut[] = [];
  for (const row of [...batting, ...bowling]) {
    const format = playerFormatLabel(row.st, row.ft);
    const stats = row.s as CrexBattingStats & CrexBowlingStats;
    const fixture = (stats.btd ?? stats.bod ?? '').trim();
    if (!format || !fixture || debuts.some((d) => d.format === format)) continue;
    debuts.push({
      format,
      fixture,
      matchId: cleanKey(stats.btdm?.mf ?? stats.bodm?.mf) || null,
    });
  }

  return {
    id,
    name: basic.fn.trim() || names.p.get(id)?.n || id,
    image: `${PLAYER_IMAGE_BASE}/${id}.png`,
    role: playerRole(basic.rl),
    gender: basic.g === 1 ? 'Female' : 'Male',
    dateOfBirth: basic.dob ? new Date(basic.dob).toISOString() : null,
    age: ageFrom(basic.dob),
    birthPlace: basic.pob?.trim() || null,
    height: basic.h?.trim() || null,
    nationality: basic.n?.trim() || null,
    bats: joinTrait(basic.bts, basic.bp),
    bowls: joinTrait(basic.bwl, bowlingStyle(basic.bs)),
    popularShot: basic.ps?.trim() || null,
    teams: (basic.tm ?? '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
    countryKey,
    countryShortName: countryKey
      ? names.t.get(countryKey)?.sn ?? names.t.get(countryKey)?.n ?? null
      : null,
    bio: sanitizeBio(basic.p),
    instagram: basic.iu?.trim() || null,
    twitter: basic.tu?.replace(/^@/, '').trim() || null,
    // Rankings label their format with the international competition code, not
    // the row's own — a #1 Test batter is ranked in Tests, not in a league.
    rankings: (raw.b ?? [])
      .map((r) => ({
        format: playerFormatLabel(1, r.ft) ?? '',
        position: r.pos,
        discipline: rankingDiscipline(r.type),
      }))
      .filter((r) => r.format && r.position > 0),
    batting: batting
      .map((row) => {
        const format = playerFormatLabel(row.st, row.ft);
        if (!format) return null;
        const s = row.s ?? {};
        return {
          format,
          international: INTERNATIONAL_COMPETITIONS.has(row.st),
          matches: s.m ?? 0,
          innings: s.i ?? 0,
          runs: s.r ?? 0,
          hundreds: s.hd ?? 0,
          fifties: s.ff ?? 0,
          highScore: s.hs ?? 0,
          strikeRate: s.sr ?? 0,
          average: s.av ?? 0,
          fours: s.fr ?? 0,
          sixes: s.sx ?? 0,
          ducks: s.du ?? s.dk ?? null,
          highScoreMatchId: cleanKey(s.hsm?.mf) || null,
        } satisfies PlayerBattingCareer;
      })
      .filter((r): r is PlayerBattingCareer => r !== null),
    bowling: bowling
      .map((row) => {
        const format = playerFormatLabel(row.st, row.ft);
        if (!format) return null;
        const s = row.s ?? {};
        return {
          format,
          international: INTERNATIONAL_COMPETITIONS.has(row.st),
          matches: s.m ?? 0,
          innings: s.i ?? 0,
          wickets: s.w ?? 0,
          economy: s.ec ?? 0,
          average: s.bav ?? 0,
          // "0-0" is crex's placeholder for a bowler with no figures at all.
          best: s.bf && s.bf !== '0-0' && s.bf !== '0/0' ? s.bf : null,
          threeWickets: s.w3 ?? 0,
          fiveWickets: s.w5 ?? 0,
          strikeRate: s.bsr ?? 0,
        } satisfies PlayerBowlingCareer;
      })
      .filter((r): r is PlayerBowlingCareer => r !== null),
    recentBatting: recentBatting.map((r) => toFormEntry(r, 'batting', names)),
    recentBowling: recentBowling.map((r) => toFormEntry(r, 'bowling', names)),
    debuts,
  };
}

// ---------------------------------------------------------------------------
// Standings
// ---------------------------------------------------------------------------
//
// The one response in this file that is not obfuscated. `/series/table` sends
// crex's own column headings — `P`, `W`, `L`, `NR`, `Pts`, `NRR` — as strings,
// even the ones that are numbers, so the decode here is mostly parseInt and a
// rename. What it is *not* is a table: see below.

/** One row of a points table, in crex's own vocabulary. */
interface CrexPointsRow {
  team_fkey?: string;
  team_name?: string;
  P?: string;
  W?: string;
  L?: string;
  /** Limited-overs tables only. A Test table sends `Draw` instead. */
  NR?: string;
  /** Test tables only. */
  Draw?: string;
  Pts?: string;
  /** "0" on a Test table, where the figure does not exist. */
  NRR?: string;
  /**
   * crex's own position — and not to be trusted. It goes stale against the rest
   * of the row: TNPL 2026 sent Tiruppur (8 pts, −0.013) as rank 5 and Nellai
   * (8 pts, −0.146) as rank 4, while the *array* had them the right way round,
   * and it is the array order the `qualified` flags follow. Sorting by this
   * field put the qualification marks on the wrong sides. Position is taken
   * from the array instead; see `getCrexSeriesTable`.
   */
  rank?: number;
  /** Last five, oldest first: ["W","L","W","W","W"]. */
  rf?: string[];
  qualified?: number;
  eliminated?: number;
  is_winner?: number;
}

/** One group. A league sends a single entry; a group stage sends one per group. */
interface CrexPointsGroup {
  g_name?: string;
  pt_info?: CrexPointsRow[];
}

/** Raw standings for one series. An array of groups — see `getCrexSeriesTable`. */
function getCrexPointsTable(
  seriesKey: string,
  opts: FetchOpts = {}
): Promise<CrexPointsGroup[]> {
  return crexGet<CrexPointsGroup[]>(
    `/series/table?key=${encodeURIComponent(cleanKey(seriesKey))}`,
    { revalidate: 300, ...opts }
  );
}

/** crex's `rf` letters. Anything else — an abandoned game — reads as a no-result. */
function formLetter(raw: string): 'W' | 'L' | 'N' {
  const c = (raw ?? '').trim().toUpperCase();
  return c === 'W' ? 'W' : c === 'L' ? 'L' : 'N';
}

/** `"4"` → 4. Every count on this response is a string, and some are absent. */
const asCount = (raw: string | undefined): number => {
  const n = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(n) ? n : 0;
};

/**
 * A count that may not exist as a column at all.
 *
 * The distinction matters: a limited-overs table has an `NR` column that can
 * legitimately read 0, and a Test table has no `NR` column whatsoever. Both
 * would be `0` through `asCount`, and the table would then draw an empty NR
 * column on every Test series.
 */
const asOptionalCount = (raw: string | undefined): number | null =>
  raw === undefined ? null : asCount(raw);

/**
 * Sides a group needs before it is a tournament rather than a bilateral series.
 *
 * Two is a tour: England and Pakistan playing each other three times, where the
 * table is a scoreline (won, lost, drawn) and there are no competition points to
 * award. Three is the smallest field that awards them — a tri-series.
 *
 * crex sends `Pts` on both and fills it with zeros on the tour, which is what
 * makes this a decision rather than a read: the column exists on the wire and
 * means nothing there. See `PointsTableGroup.tournament`.
 */
const MIN_TABLE_ROWS = 3;

/** NRR, or null where the format has none. See the `netRunRate` note on the type. */
function nullableRate(raw: string | undefined): string | null {
  const text = (raw ?? '').trim();
  if (!text || text === '0' || text === '0.000' || text === '-') return null;
  return text;
}

/**
 * A series' standings, grouped.
 *
 * Groups, not one table, because that is what crex sends and what the
 * competition is: the CPL answers with a single group, a World Cup group stage
 * with one per group. Flattening them would produce a standing that describes no
 * competition — Group A's third-placed side listed above Group B's leader.
 *
 * Rows arrive **unsorted**; `rank` is crex's own position and is what they are
 * ordered by here. Sorting on points instead would disagree with crex on exactly
 * the rows where it matters, because the tiebreaker below points is net run rate
 * and below that it is head-to-head, which this response does not carry.
 *
 * Returns an empty array for a series with no table — a bilateral tour, which is
 * most of them. That is a normal answer, not a failure: the caller renders
 * nothing rather than an empty table.
 */
export async function getCrexSeriesTable(
  seriesKey: string,
  opts: FetchOpts = {}
): Promise<PointsTableGroup[]> {
  const raw = await getCrexPointsTable(seriesKey, opts);
  // Any group with rows, whether or not anything has been played in it: a table
  // of zeros still names the sides and says nobody has a point yet, which is a
  // real answer and the state crex shows. Only an empty group is dropped.
  const groups = (Array.isArray(raw) ? raw : []).filter((g) => g?.pt_info?.length);
  if (!groups.length) return [];

  const names = await resolveKeys(
    { t: groups.flatMap((g) => (g.pt_info ?? []).map((r) => r.team_fkey ?? '')) },
    opts
  );

  // A single-table competition puts the competition's own name in `g_name`,
  // which above one table is the page heading again — so it is dropped there and
  // kept only where it distinguishes one group from another.
  const named = groups.length > 1;

  return groups.map((g) => ({
    name: named ? g.g_name?.trim() || null : null,
    tournament: (g.pt_info?.length ?? 0) >= MIN_TABLE_ROWS,
    // crex sends the rows already in standings order — points, then net run
    // rate — and its per-row `rank` disagrees with that order often enough to
    // be useless. Position is the row's place in the list.
    rows: (g.pt_info ?? [])
      .map((r, i) => {
        const teamKey = cleanKey(r.team_fkey);
        const team = toTeam(teamKey, names);

        return {
          teamKey,
          // crex names the side on the row itself, which is the one place in this
          // API where a name arrives without a mapping lookup. Preferred over the
          // resolved name only as a fallback, so the whole app says "Guyana
          // Amazon Warriors" the same way.
          team: team.name === teamKey && r.team_name ? { ...team, name: r.team_name } : team,
          rank: i + 1,
          played: asCount(r.P),
          won: asCount(r.W),
          lost: asCount(r.L),
          noResult: asOptionalCount(r.NR),
          drawn: asOptionalCount(r.Draw),
          points: asCount(r.Pts),
          // crex fills NRR with a bare "0" on a Test table, where net run rate
          // is not a thing. Printed as-is that reads as a real rate of exactly
          // zero, which is a figure no side has ever had.
          netRunRate: nullableRate(r.NRR),
          form: (r.rf ?? []).map(formLetter),
          qualified: r.qualified === 1,
          eliminated: r.eliminated === 1,
          champion: r.is_winner === 1,
        } satisfies PointsTableRow;
      }),
  }));
}

// ---------------------------------------------------------------------------
// Series leaders
// ---------------------------------------------------------------------------
//
// The tournament's honours board, out of crex's series *overview* rather than
// any stats endpoint — every `seriesInside/get*StatsForSeriesID` spelling 404s,
// and the block is a corner of a payload that mostly carries things this app
// gets elsewhere. Only `i4` is read here.
//
// Its shape is worth naming: `i4.i` is keyed by crex format id, and each entry
// holds every category as a ONE-ENTRY ARRAY — `mr[0]` is the leading run scorer,
// not the list of them. There is no "top five" on the wire; a single name per
// category is all this answers, which is why the UI is an honours board and not
// a leaderboard table.

/** One category's leader as crex sends it. Players and teams are f_keys. */
interface CrexLeader {
  /** The category's own code, repeated inside the entry ("mr", "mw"). */
  name?: string;
  /** Team f_key. */
  tf?: string;
  /** Player f_key. */
  pf?: string;
  /**
   * The headline figure. A string on the counting categories ("416", "17/5") and
   * a number on the rates, because crex sends each as it stores it.
   */
  v?: string | number;
  /** Innings batted or bowled in. */
  bi?: string;
  /** Strike rate, on the batting categories. */
  sr?: number;
  /** Economy, on `mw`. */
  econ?: number;
  /** Runs a best strike rate came off — `bsr` only. */
  r?: string;
  /** Wickets a best economy was taken at — `bec` only. */
  w?: string;
}

/** The tournament's own tallies, sent beside the leaders. */
interface CrexLeaderTotals {
  t4?: string;
  t6?: string;
}

type CrexLeaderBlock = Partial<Record<string, CrexLeader[]>> & { totals?: CrexLeaderTotals };

/**
 * crex's series overview. `i1`–`i9`, of which this app reads one: `i4`, the
 * leaders. The rest duplicates the schedule, table and venues it already has.
 */
interface CrexSeriesOverview {
  i4?: {
    /** Active format — which key of `i` the series is currently playing. */
    af?: number;
    /** Leaders by format id. */
    i?: Record<string, CrexLeaderBlock>;
  };
}

export function getCrexSeriesOverview(
  seriesKey: string,
  opts: FetchOpts = {}
): Promise<CrexSeriesOverview> {
  return crexGet<CrexSeriesOverview>(
    `/series/overview?key=${encodeURIComponent(cleanKey(seriesKey))}`,
    { revalidate: 300, ...opts }
  );
}

/** A rate as a printed figure: crex sends 169.7959, cricket prints 169.80. */
const rate = (n: number | undefined): string | null =>
  typeof n === 'number' && Number.isFinite(n) ? n.toFixed(2) : null;

/** The headline figure, whichever way crex typed it. */
function leaderValue(raw: CrexLeader['v']): string | null {
  if (typeof raw === 'number') return Number.isInteger(raw) ? String(raw) : rate(raw);
  const text = (raw ?? '').trim();
  return text || null;
}

/**
 * Best bowling figures, printed the way cricket writes them.
 *
 * crex sends "19/5" — runs first, wickets second — which read straight off the
 * wire says nineteen wickets for five runs. Flipped here, with the one guard the
 * ambiguity allows: a second number above ten cannot be a wicket count, so a
 * payload that already arrives wickets-first is left alone.
 */
function bowlingFigures(raw: CrexLeader['v']): string | null {
  const text = leaderValue(raw);
  if (!text || !text.includes('/')) return text;

  const [first, second] = text.split('/');
  const wickets = Number.parseInt(second ?? '', 10);
  if (!Number.isFinite(wickets) || wickets > 10) return text;
  return `${second}/${first}`;
}

/** Category order, labels, and how each one's figure and footnote are built. */
const LEADER_SPECS: Array<{
  code: string;
  kind: SeriesLeaderKind;
  label: string;
  value: (l: CrexLeader) => string | null;
  support: (l: CrexLeader) => string | null;
}> = [
  {
    code: 'mr',
    kind: 'RUNS',
    label: 'Most runs',
    value: (l) => leaderValue(l.v),
    support: (l) => (rate(l.sr) ? `SR ${rate(l.sr)}` : null),
  },
  {
    code: 'mw',
    kind: 'WICKETS',
    label: 'Most wickets',
    value: (l) => leaderValue(l.v),
    support: (l) => (rate(l.econ) ? `Econ ${rate(l.econ)}` : null),
  },
  {
    code: 'hs',
    kind: 'HIGHEST_SCORE',
    label: 'Highest score',
    value: (l) => leaderValue(l.v),
    support: (l) => (rate(l.sr) ? `SR ${rate(l.sr)}` : null),
  },
  {
    code: 'bf',
    kind: 'BEST_FIGURES',
    label: 'Best figures',
    value: (l) => bowlingFigures(l.v),
    support: () => null,
  },
  { code: 'ms', kind: 'SIXES', label: 'Most sixes', value: (l) => leaderValue(l.v), support: () => null },
  { code: 'mf', kind: 'FOURS', label: 'Most fours', value: (l) => leaderValue(l.v), support: () => null },
  {
    code: 'bsr',
    kind: 'STRIKE_RATE',
    label: 'Best strike rate',
    value: (l) => leaderValue(l.v),
    // The runs it came off, because a strike rate without them is a rate over an
    // unknown number of balls — 200 off 10 is not the same claim as 200 off 300.
    support: (l) => (l.r ? `${l.r} runs` : null),
  },
  {
    code: 'bec',
    kind: 'ECONOMY',
    label: 'Best economy',
    value: (l) => leaderValue(l.v),
    support: (l) => (l.w ? `${l.w} wkts` : null),
  },
  { code: 'md', kind: 'DOTS', label: 'Most dots', value: (l) => leaderValue(l.v), support: () => null },
  {
    code: 'mfp',
    kind: 'FANTASY',
    label: 'Most fantasy points',
    value: (l) => leaderValue(l.v),
    support: () => null,
  },
];

const asTotal = (raw: string | undefined): number | null => {
  const n = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(n) ? n : null;
};

/**
 * Who is leading this tournament, and in what.
 *
 * Returns null where crex has no leaders for the series — a tour that has not
 * started, and every series whose overview carries no `i4` — so the caller can
 * drop the section rather than render an empty board.
 *
 * A multi-format tour sends one block per format. The one crex marks active
 * (`af`) is used, because that is the leg being played and the leg the page is
 * about; falling back to the first key covers a finished tour where `af` no
 * longer matches anything.
 */
export async function getCrexSeriesLeaders(
  seriesKey: string,
  opts: FetchOpts = {}
): Promise<SeriesLeaders | null> {
  const overview = await getCrexSeriesOverview(seriesKey, opts);
  const blocks = overview.i4?.i ?? {};
  const keys = Object.keys(blocks);
  if (!keys.length) return null;

  const active = String(overview.i4?.af ?? '');
  const block = blocks[active] ?? blocks[keys[0]];
  if (!block) return null;

  const found = LEADER_SPECS.map((spec) => ({ spec, entry: block[spec.code]?.[0] })).filter(
    (row): row is { spec: (typeof LEADER_SPECS)[number]; entry: CrexLeader } =>
      Boolean(row.entry?.pf && row.spec.value(row.entry as CrexLeader))
  );
  if (!found.length) return null;

  const names = await resolveKeys(
    {
      p: found.map((r) => r.entry.pf ?? ''),
      t: found.map((r) => r.entry.tf ?? ''),
    },
    opts
  );

  const leaders: SeriesLeader[] = found.map(({ spec, entry }) => {
    const playerKey = cleanKey(entry.pf);
    const innings = Number.parseInt(entry.bi ?? '', 10);

    return {
      kind: spec.kind,
      label: spec.label,
      // Non-null: the filter above kept only the entries whose value resolved.
      value: spec.value(entry) as string,
      playerKey,
      playerName: names.p.get(playerKey)?.n ?? playerKey,
      playerImage: playerKey ? `${PLAYER_IMAGE_BASE}/${playerKey}.png` : null,
      team: toTeam(cleanKey(entry.tf), names),
      innings: Number.isFinite(innings) ? innings : null,
      support: spec.support(entry),
    };
  });

  return {
    leaders,
    fours: asTotal(block.totals?.t4),
    sixes: asTotal(block.totals?.t6),
  };
}

// ---------------------------------------------------------------------------
// Series stat tables — the full ranking behind an honour
// ---------------------------------------------------------------------------
//
// crex has no series-leaderboard endpoint. Their own "Most Runs in …" page is a
// GraphQL call (`getFinalData` on crickapi.com/graphql) keyed by a numeric
// tournament id and season string that nothing in the public payloads resolves —
// probing it with every id this app can see returns empty rows.
//
// So the ranking is aggregated from the scorecards, which are public and carry
// every column the table needs. That is more requests than an endpoint would be
// (one per played match), so it is deliberately confined to the stat pages, is
// fetched with a long revalidate, and runs at a bounded concurrency.
//
// One consequence worth naming: these figures are ours, from the cards, while
// the headline on a Key stats card is crex's own. They agree in almost every
// case; where a match was awarded without a completed card they can differ by a
// row. The table is the honest one — it shows its working.

/** Matches whose cards are read for one table. Two full seasons of a league. */
const STAT_MATCH_CAP = 80;

/** Cards fetched at once. Enough to be quick, few enough to be polite. */
const STAT_FETCH_WIDTH = 8;

/** Long, because a finished card never changes and a live one is not the point. */
const STAT_REVALIDATE = 900;

interface StatAccumulator {
  playerKey: string;
  name: string;
  teamKey: string;
  team: Team;
  /** Matches the player appeared in, either discipline. */
  matches: Set<string>;
  bat: {
    innings: number;
    runs: number;
    balls: number;
    fours: number;
    sixes: number;
    notOuts: number;
    fifties: number;
    hundreds: number;
    best: number;
    bestNotOut: boolean;
  };
  bowl: {
    innings: number;
    balls: number;
    runs: number;
    wickets: number;
    bestWickets: number;
    bestRuns: number;
    fiveFors: number;
  };
}

function emptyAccumulator(playerKey: string, name: string, team: Team): StatAccumulator {
  return {
    playerKey,
    name,
    teamKey: team.id,
    team,
    matches: new Set(),
    bat: {
      innings: 0,
      runs: 0,
      balls: 0,
      fours: 0,
      sixes: 0,
      notOuts: 0,
      fifties: 0,
      hundreds: 0,
      best: -1,
      bestNotOut: false,
    },
    bowl: { innings: 0, balls: 0, runs: 0, wickets: 0, bestWickets: -1, bestRuns: 0, fiveFors: 0 },
  };
}

const ratio = (top: number, bottom: number): number | null =>
  bottom > 0 ? Math.round((top / bottom) * 100) / 100 : null;

/**
 * Run the fetches a few at a time.
 *
 * A 43-match league fetched all at once is 43 simultaneous requests through the
 * Worker for one page render; sequentially it is 43 round trips. Neither is
 * right, so the list is walked in slices.
 */
async function inWidth<T, R>(items: T[], width: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += width) {
    out.push(...(await Promise.all(items.slice(i, i + width).map(fn))));
  }
  return out;
}

/** How each table is labelled, sorted, and what figure it prints. */
const STAT_SPECS: Record<
  SeriesStatKind,
  {
    label: string;
    discipline: 'BATTING' | 'BOWLING';
    /** Rows that do not clear this are not in the table at all. */
    qualifies: (row: SeriesStatRow) => boolean;
    /** The printed figure. */
    value: (row: SeriesStatRow) => string;
    /** Descending sort keys, most significant first. Ties fall to the next. */
    keys: (row: SeriesStatRow) => number[];
    qualifier: string | null;
  }
> = {
  RUNS: {
    label: 'Most runs',
    discipline: 'BATTING',
    qualifies: (r) => r.batting.innings > 0,
    value: (r) => String(r.batting.runs),
    keys: (r) => [r.batting.runs, r.batting.strikeRate ?? 0],
    qualifier: null,
  },
  WICKETS: {
    label: 'Most wickets',
    discipline: 'BOWLING',
    qualifies: (r) => r.bowling.innings > 0,
    value: (r) => String(r.bowling.wickets),
    keys: (r) => [r.bowling.wickets, -(r.bowling.economy ?? 99)],
    qualifier: null,
  },
  HIGHEST_SCORE: {
    label: 'Highest score',
    discipline: 'BATTING',
    qualifies: (r) => r.batting.innings > 0,
    value: (r) => r.batting.highest,
    // The `*` is stripped for sorting; an unbeaten score of the same size ranks
    // above a dismissed one, which is how a scorecard reads it.
    keys: (r) => [Number.parseInt(r.batting.highest, 10) || 0, r.batting.highest.includes('*') ? 1 : 0],
    qualifier: null,
  },
  BEST_FIGURES: {
    label: 'Best figures',
    discipline: 'BOWLING',
    qualifies: (r) => r.bowling.wickets > 0,
    value: (r) => r.bowling.best,
    keys: (r) => {
      const [w, runs] = r.bowling.best.split('/');
      return [Number.parseInt(w, 10) || 0, -(Number.parseInt(runs, 10) || 0)];
    },
    qualifier: null,
  },
  SIXES: {
    label: 'Most sixes',
    discipline: 'BATTING',
    qualifies: (r) => r.batting.sixes > 0,
    value: (r) => String(r.batting.sixes),
    keys: (r) => [r.batting.sixes, r.batting.runs],
    qualifier: null,
  },
  FOURS: {
    label: 'Most fours',
    discipline: 'BATTING',
    qualifies: (r) => r.batting.fours > 0,
    value: (r) => String(r.batting.fours),
    keys: (r) => [r.batting.fours, r.batting.runs],
    qualifier: null,
  },
  FIFTIES: {
    label: 'Most fifties',
    discipline: 'BATTING',
    qualifies: (r) => r.batting.fifties > 0,
    value: (r) => String(r.batting.fifties),
    keys: (r) => [r.batting.fifties, r.batting.runs],
    qualifier: null,
  },
  HUNDREDS: {
    label: 'Most hundreds',
    discipline: 'BATTING',
    qualifies: (r) => r.batting.hundreds > 0,
    value: (r) => String(r.batting.hundreds),
    keys: (r) => [r.batting.hundreds, r.batting.runs],
    qualifier: null,
  },
  // The two rate tables need a cut, or they are won by a tail-ender who hit one
  // ball for six and a bowler who was taken off after an over.
  STRIKE_RATE: {
    label: 'Best strike rate',
    discipline: 'BATTING',
    qualifies: (r) => r.batting.balls >= 30 && r.batting.strikeRate !== null,
    value: (r) => (r.batting.strikeRate ?? 0).toFixed(2),
    keys: (r) => [r.batting.strikeRate ?? 0, r.batting.runs],
    qualifier: '30 balls faced',
  },
  ECONOMY: {
    label: 'Best economy',
    discipline: 'BOWLING',
    qualifies: (r) => r.bowling.overs >= 10 && r.bowling.economy !== null,
    value: (r) => (r.bowling.economy ?? 0).toFixed(2),
    // Ascending, so the key is negated — the whole sort is one direction.
    keys: (r) => [-(r.bowling.economy ?? 99), r.bowling.wickets],
    qualifier: '10 overs bowled',
  },
};

export function seriesStatLabel(kind: SeriesStatKind): string {
  return STAT_SPECS[kind].label;
}

export const SERIES_STAT_KINDS = Object.keys(STAT_SPECS) as SeriesStatKind[];

/**
 * One ranking for one series — the top `limit` players, with the batting or
 * bowling totals behind the figure.
 *
 * Returns null where the series has no completed card to read, which is every
 * series before its first result.
 */
export async function getCrexSeriesStatTable(
  seriesKey: string,
  kind: SeriesStatKind,
  opts: FetchOpts & { limit?: number } = {}
): Promise<SeriesStatTable | null> {
  const limit = opts.limit ?? 10;
  const schedule = await getCrexSeriesSchedule(seriesKey, {
    revalidate: STAT_REVALIDATE,
    ...opts,
  }).catch(() => null);
  if (!schedule) return null;

  // Only matches that have produced a card. A live match counts: its innings so
  // far are real runs, and crex's own tables include them.
  const played = schedule.matches
    .filter((m) => m.matchKey && m.status !== 'UPCOMING')
    .slice(-STAT_MATCH_CAP);
  if (!played.length) return null;

  const cards = await inWidth(played, STAT_FETCH_WIDTH, async (match) => ({
    match,
    innings: await getCrexScorecard(match.matchKey as string, {
      revalidate: STAT_REVALIDATE,
      signal: opts.signal,
    }).catch(() => [] as InningsScore[]),
  }));

  const players = new Map<string, StatAccumulator>();
  let matchesCounted = 0;

  const sideOf = (match: SeriesScheduleMatch, teamId: string | undefined): Team =>
    teamId && match.awayTeam.id === cleanKey(teamId) ? match.awayTeam : match.homeTeam;
  const opposite = (match: SeriesScheduleMatch, teamId: string | undefined): Team =>
    sideOf(match, teamId).id === match.homeTeam.id ? match.awayTeam : match.homeTeam;

  for (const { match, innings } of cards) {
    if (!innings.length) continue;
    matchesCounted += 1;

    for (const inn of innings) {
      const batted = sideOf(match, inn.teamId);
      const bowled = opposite(match, inn.teamId);

      for (const line of inn.batting ?? []) {
        if (!line.playerId) continue;
        const key = cleanKey(line.playerId);
        const acc = players.get(key) ?? emptyAccumulator(key, line.name, batted);
        players.set(key, acc);

        acc.matches.add(match.key);
        acc.bat.innings += 1;
        acc.bat.runs += line.runs;
        acc.bat.balls += line.balls;
        acc.bat.fours += line.fours;
        acc.bat.sixes += line.sixes;
        // Retired hurt is not an innings ended by the bowler, but it is not a
        // not-out for averaging either: crex counts it as one, so this does too.
        if (!line.out) acc.bat.notOuts += 1;
        if (line.runs >= 100) acc.bat.hundreds += 1;
        else if (line.runs >= 50) acc.bat.fifties += 1;

        if (line.runs > acc.bat.best) {
          acc.bat.best = line.runs;
          acc.bat.bestNotOut = !line.out;
        } else if (line.runs === acc.bat.best && !line.out) {
          acc.bat.bestNotOut = true;
        }
      }

      for (const line of inn.bowling ?? []) {
        if (!line.playerId) continue;
        const key = cleanKey(line.playerId);
        const acc = players.get(key) ?? emptyAccumulator(key, line.name, bowled);
        players.set(key, acc);

        acc.matches.add(match.key);
        acc.bowl.innings += 1;
        // `overs` is crex's printed figure — 4.3 is four overs and three balls,
        // not four and a half — so it is converted before it is summed.
        acc.bowl.balls += ballsFrom(line.overs, DEFAULT_BALLS_PER_OVER);
        acc.bowl.runs += line.runs;
        acc.bowl.wickets += line.wickets;
        if (line.wickets >= 5) acc.bowl.fiveFors += 1;

        if (
          line.wickets > acc.bowl.bestWickets ||
          (line.wickets === acc.bowl.bestWickets && line.runs < acc.bowl.bestRuns)
        ) {
          acc.bowl.bestWickets = line.wickets;
          acc.bowl.bestRuns = line.runs;
        }
      }
    }
  }

  if (!players.size) return null;

  const spec = STAT_SPECS[kind];

  const rows: SeriesStatRow[] = [...players.values()].map((acc) => {
    const dismissals = acc.bat.innings - acc.bat.notOuts;

    const batting: SeriesBattingTotals = {
      matches: acc.matches.size,
      innings: acc.bat.innings,
      runs: acc.bat.runs,
      balls: acc.bat.balls,
      highest: acc.bat.best < 0 ? '—' : `${acc.bat.best}${acc.bat.bestNotOut ? '*' : ''}`,
      notOuts: acc.bat.notOuts,
      average: ratio(acc.bat.runs, dismissals),
      strikeRate: acc.bat.balls > 0 ? Math.round((acc.bat.runs / acc.bat.balls) * 10000) / 100 : null,
      fours: acc.bat.fours,
      sixes: acc.bat.sixes,
      fifties: acc.bat.fifties,
      hundreds: acc.bat.hundreds,
    };

    const bowling: SeriesBowlingTotals = {
      matches: acc.matches.size,
      innings: acc.bowl.innings,
      overs: oversFrom(acc.bowl.balls, DEFAULT_BALLS_PER_OVER),
      runs: acc.bowl.runs,
      wickets: acc.bowl.wickets,
      best: acc.bowl.bestWickets < 0 ? '—' : `${acc.bowl.bestWickets}/${acc.bowl.bestRuns}`,
      average: ratio(acc.bowl.runs, acc.bowl.wickets),
      economy:
        acc.bowl.balls > 0
          ? Math.round((acc.bowl.runs / (acc.bowl.balls / DEFAULT_BALLS_PER_OVER)) * 100) / 100
          : null,
      strikeRate: ratio(acc.bowl.balls, acc.bowl.wickets),
      fiveFors: acc.bowl.fiveFors,
    };

    return {
      rank: 0,
      playerKey: acc.playerKey,
      playerName: acc.name,
      playerImage: acc.playerKey ? `${PLAYER_IMAGE_BASE}/${acc.playerKey}.png` : null,
      team: acc.team,
      value: '',
      batting,
      bowling,
    };
  });

  const ranked = rows
    .filter(spec.qualifies)
    .sort((a, b) => {
      const ka = spec.keys(a);
      const kb = spec.keys(b);
      for (let i = 0; i < ka.length; i++) {
        if (kb[i] !== ka[i]) return kb[i] - ka[i];
      }
      return a.playerName.localeCompare(b.playerName);
    })
    .slice(0, limit)
    .map((row, i) => ({ ...row, rank: i + 1, value: spec.value(row) }));

  if (!ranked.length) return null;

  return {
    kind,
    label: spec.label,
    discipline: spec.discipline,
    rows: ranked,
    matchesCounted,
    qualifier: spec.qualifier,
  };
}

// ---------------------------------------------------------------------------
// Series squads
// ---------------------------------------------------------------------------

/** One side's squad for one series, as crex sends it. Players are f_keys. */
interface CrexSeriesSquad {
  /** Team f_key. */
  tf?: string;
  /** Format id, the same vocabulary as `ft` elsewhere. */
  ft?: number;
  /** The squad. */
  pf?: string[];
  /** Captain — an array, though it holds one key. */
  c?: string[];
  /** Vice captain. */
  vc?: string[];
  /** Overseas players. */
  f?: string[];
  /** Wicket-keeper. */
  iw?: string[];
}

/** Every side's squad for a series. */
export function getCrexSeriesSquads(
  seriesKey: string,
  opts: FetchOpts = {}
): Promise<CrexSeriesSquad[]> {
  return crexGet<CrexSeriesSquad[]>(
    `/series/squads?key=${encodeURIComponent(cleanKey(seriesKey))}`,
    { revalidate: 3600, ...opts }
  );
}

/**
 * One side's named squad for a series, or an empty list where crex has none.
 *
 * Roles come from the flags rather than from a role field — crex sends the keeper
 * in `iw` and says nothing about anyone else's discipline here, so everyone else
 * is `BATSMAN` by default. That is a real limitation, and the page prints the
 * squad as a list of names rather than as a batting/bowling split because of it:
 * grouping by a role we have not been told would be inventing the grouping.
 */
export async function getCrexTeamSquad(
  seriesKey: string,
  teamKey: string,
  opts: FetchOpts = {}
): Promise<SquadPlayer[]> {
  const want = cleanKey(teamKey);
  const all = await getCrexSeriesSquads(seriesKey, opts);

  // A side can be listed once per format on a multi-format tour. The longest
  // list is the one worth showing: a Test squad names more players than the T20
  // squad drawn out of it.
  const mine = (Array.isArray(all) ? all : [])
    .filter((sq) => cleanKey(sq.tf) === want && sq.pf?.length)
    .sort((a, b) => (b.pf?.length ?? 0) - (a.pf?.length ?? 0))[0];
  if (!mine?.pf?.length) return [];

  const captains = new Set((mine.c ?? []).map(cleanKey));
  const keepers = new Set((mine.iw ?? []).map(cleanKey));
  const names = await resolveKeys({ p: mine.pf }, opts);

  return mine.pf
    .map((raw) => {
      const id = cleanKey(raw);
      const name = names.p.get(id)?.n;
      // A key the mapping cannot name is dropped rather than printed as a key —
      // "5YW" in a squad list tells the reader nothing.
      if (!id || !name) return null;
      const player: SquadPlayer = {
        id,
        name,
        role: keepers.has(id) ? 'WK' : 'BATSMAN',
        isCaptain: captains.has(id) || undefined,
      };
      return player;
    })
    .filter((p): p is SquadPlayer => p !== null);
}

/**
 * Both sides' squads for a match, taken from the series rather than the match.
 *
 * crex announces a match XI close to the start and serves it keyed by match, so
 * an upcoming fixture — and every fixture with no match key at all — has nothing
 * on that endpoint. What it does have is the tour party: /series/squads names
 * every side in the competition from the day it is announced, which is weeks
 * earlier.
 *
 * So this is the squad a preview shows. It is the wider list, not the XI, and the
 * match page labels it as the series squad for exactly that reason. Where crex
 * has announced an XI the match page still prefers it — see MatchDetail, which
 * lets the per-match squads win over these.
 *
 * Null when crex names neither side, which is most bilateral tours.
 */
export async function getCrexMatchSeriesSquads(
  match: Pick<Match, 'series' | 'homeTeam' | 'awayTeam'>,
  opts: FetchOpts = {}
): Promise<MatchSquads | null> {
  const seriesKey = cleanKey(match.series?.id);
  if (!seriesKey) return null;

  const [home, away] = await Promise.all([
    getCrexTeamSquad(seriesKey, match.homeTeam.id, opts).catch(() => [] as SquadPlayer[]),
    getCrexTeamSquad(seriesKey, match.awayTeam.id, opts).catch(() => [] as SquadPlayer[]),
  ]);

  return home.length || away.length ? { home, away } : null;
}

// ---------------------------------------------------------------------------
// Result attribution
// ---------------------------------------------------------------------------
//
// crex reports a result as a sentence, and the sentence is the only place two
// facts live: which side won, and whether they batted first. Both are needed by
// everything derived — a head-to-head record, a side's form strip, a ground's
// chase/defend split — and neither is a field anywhere on the wire.
//
// The wording is not consistent across endpoints, which is the catch. The
// schedule says "Guyana Amazon Warriors won by 6 wickets" (full name, lowercase
// verb); the live feed and /fixtures say "GAW Won by 7 wickets" (short name,
// capital). So the match is against both of a side's names, case-insensitively,
// and a sentence that fits neither is reported as unattributed rather than
// guessed at.

/** Split on the verb: everything before it is the winner's name. */
const WON_BY = /\s+won\s+by\s+/i;

/** A win "by N wickets" was chased; "by N runs" or "by an innings" was defended. */
export type ResultMethod = 'CHASED' | 'DEFENDED' | null;

export interface AttributedResult {
  /** f_key of the winner, or null when the sentence names no side we know. */
  winnerKey: string | null;
  method: ResultMethod;
}

/** Does this result sentence's subject name this side? */
function namesTeam(subject: string, team: Team): boolean {
  const want = subject.trim().toLowerCase();
  if (!want) return false;
  return want === team.name.trim().toLowerCase() || want === team.shortName.trim().toLowerCase();
}

/**
 * Read a result sentence against the two sides that played.
 *
 * Returns a null `winnerKey` for a draw, a tie, a no-result — and for a win this
 * cannot attribute, which is the case worth being strict about. Matching loosely
 * (a substring, say) would file "St Kitts & Nevis Patriots won by 5 wickets" as a
 * win for St Lucia often enough to poison a head-to-head record, and a record
 * that is quietly wrong is worse than one that says "8 meetings, 3-2, 3 unread".
 */
export function attributeResult(
  result: string | null | undefined,
  home: Team,
  away: Team
): AttributedResult {
  const text = (result ?? '').trim();
  if (!text || !WON_BY.test(text)) return { winnerKey: null, method: null };

  const [subject, rest = ''] = text.split(WON_BY, 2);
  const winner = namesTeam(subject, home) ? home : namesTeam(subject, away) ? away : null;

  // "by 4 wickets" — they were chasing. "by 34 runs", "by an innings and 20
  // runs" — they batted first. Read off the margin's unit, which is the only
  // thing in the sentence that says which.
  const method: ResultMethod = /wicket/i.test(rest)
    ? 'CHASED'
    : /run|innings/i.test(rest)
      ? 'DEFENDED'
      : null;

  return { winnerKey: winner?.id ?? null, method };
}

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------
//
// Team keys are on every scorecard line, every schedule row and every ranking
// row, so the app has been full of sides that were named and never openable.
// Four sources make a page out of one:
//
//   /mapping            the name, the short name and the club colours
//   /team/matches       what they have scheduled — but only that, see below
//   /fixtures (corpus)  what they have actually played, with the results
//   /rankings           where they sit, when they are a side the ICC ranks
//
// Squads are a fifth, and indirect: crex names a squad per *series*, not per
// team, so the side's nearest competition has to be found first.

/** One row of /team/matches. The /series/matches shape plus a printed date. */
interface CrexTeamMatchRow extends CrexSeriesMatch {
  /** crex's own row id, the fallback list key on a fixture with no match key. */
  id?: number;
  /** "2026/8/23". Redundant with `t`, and not read — `t` is the sortable one. */
  dt?: string;
}

/** Grouped by series f_key, which is how the squad lookup finds a competition. */
type CrexTeamMatchesResponse = Record<string, CrexTeamMatchRow[]>;

/** A team's scheduled matches, grouped by series. */
export function getCrexTeamMatches(
  teamKey: string,
  opts: FetchOpts = {}
): Promise<CrexTeamMatchesResponse> {
  return crexGet<CrexTeamMatchesResponse>(
    `/team/matches?key=${encodeURIComponent(cleanKey(teamKey))}`,
    { revalidate: 300, ...opts }
  );
}

/**
 * Split crex's "0-#8F65E6" into the hex it is hiding.
 *
 * The leading digit is a mode flag for their own gradient renderer. Kept out of
 * the returned value because a CSS colour cannot use it, and dropped rather than
 * interpreted because nothing here draws crex's gradients.
 */
function parseTeamColor(raw: string | undefined): string | null {
  const hex = /#[0-9a-f]{3,8}/i.exec(raw ?? '')?.[0];
  return hex ?? null;
}

function teamColors(entry: CrexMapEntry | undefined): TeamColors {
  return {
    primary: parseTeamColor(entry?.cc),
    secondary: parseTeamColor(entry?.uc),
    dark: parseTeamColor(entry?.dc),
  };
}

/** Every format's team-ranking list, both genders, as one flat lookup. */
async function teamRankingPositions(
  teamKey: string,
  opts: FetchOpts = {}
): Promise<TeamRankingPosition[]> {
  const genders: RankingGender[] = ['MEN', 'WOMEN'];
  const lists = await Promise.all([
    getCrexTeamRankings('men', opts).catch(() => ({}) as CrexTeamRankingsResponse),
    getCrexTeamRankings('women', opts).catch(() => ({}) as CrexTeamRankingsResponse),
  ]);

  const FORMATS: Array<['test' | 'odi' | 't20', RankingFormat]> = [
    ['test', 'TEST'],
    ['odi', 'ODI'],
    ['t20', 'T20I'],
  ];

  const out: TeamRankingPosition[] = [];
  lists.forEach((byFormat, i) => {
    for (const [wire, format] of FORMATS) {
      const rows = byFormat[wire] ?? [];
      // Position is the row's place in the list: crex sends these already
      // ordered by rating and carries no `pos` field on the team response.
      const at = rows.findIndex((r) => cleanKey(r.tf) === teamKey);
      if (at < 0) continue;
      out.push({ format, gender: genders[i], position: at + 1, rating: rows[at].r ?? 0 });
    }
  });

  return out;
}

/** A finished match, with the winner read off the result sentence. */
function toHeadToHeadMatch(m: Fixture | Match, key: string): HeadToHeadMatch {
  return {
    id: 'matchKey' in m ? m.matchKey : m.id,
    key,
    startTime: m.startTime,
    venue: m.venue,
    format: m.format,
    series: m.series.name,
    result: m.result ?? '',
    winnerKey: attributeResult(m.result, m.homeTeam, m.awayTeam).winnerKey,
  };
}

/** Newest first. The order every "recent" list on the site is read in. */
const byNewest = (a: { startTime: string }, b: { startTime: string }) =>
  +new Date(b.startTime) - +new Date(a.startTime);

/** Soonest first. */
const bySoonest = (a: { startTime: string }, b: { startTime: string }) =>
  +new Date(a.startTime) - +new Date(b.startTime);

/** Results a form strip shows. Five is what crex shows and what fits a row. */
const FORM_LENGTH = 5;

/**
 * Everything a team page renders, or null when the key names no side.
 *
 * Two things are worth knowing about the shape of this:
 *
 * **`/team/matches` is not a fixture list.** It returns the side's *scheduled*
 * matches, which for a team between tournaments is nothing at all and for a team
 * mid-league is only that league. So upcoming fixtures are the union of it and
 * the schedule corpus, deduped — the endpoint reaches further ahead than the
 * corpus does, and the corpus covers sides the endpoint answers empty for.
 *
 * **Form is derived, not fetched.** A W/L strip needs a winner per match, and
 * that only exists as a sentence; see `attributeResult`. A match this cannot
 * attribute is left out of the strip rather than counted as a loss.
 */
export async function getCrexTeamProfile(
  teamKey: string,
  opts: FetchOpts = {}
): Promise<TeamProfile | null> {
  const key = cleanKey(teamKey);
  if (!key) return null;

  const [names, scheduled, corpus, rankings] = await Promise.all([
    resolveKeys({ t: [key] }, opts),
    getCrexTeamMatches(key, opts).catch(() => ({} as CrexTeamMatchesResponse)),
    getCrexFixtureRange(opts).catch(() => [] as Fixture[]),
    teamRankingPositions(key, opts),
  ]);

  const entry = names.t.get(key);
  // No name and no cricket: nothing here would render, so this is a 404 rather
  // than an empty page. A side crex names but has no fixtures for is still a
  // page — plenty of national sides are between tours.
  const mine = corpus.filter((m) => m.homeTeam.id === key || m.awayTeam.id === key);
  if (!entry && !mine.length && !Object.keys(scheduled).length) return null;

  const team = toTeam(key, names);

  // --- Upcoming: the endpoint's rows, then anything the corpus adds ----------
  const scheduledRows = Object.entries(scheduled ?? {}).flatMap(([seriesKey, rows]) =>
    (rows ?? [])
      .filter((r) => r?.t && (r.s ?? 0) !== 2)
      .map((r) => ({ seriesKey: cleanKey(seriesKey), row: r }))
  );

  const rowNames = await resolveKeys(
    {
      t: scheduledRows.flatMap(({ row }) => [row.t1f ?? '', row.t2f ?? '']),
      v: scheduledRows.map(({ row }) => row.vf ?? ''),
      s: scheduledRows.map(({ seriesKey }) => seriesKey),
    },
    opts
  );

  const fromEndpoint: Match[] = scheduledRows.map(({ seriesKey, row }) => ({
    id: cleanKey(row.mf) || scheduledMatchId(seriesKey, row.id),
    homeTeam: toTeam(row.t1f ?? '', rowNames),
    awayTeam: toTeam(row.t2f ?? '', rowNames),
    series: { id: seriesKey, name: rowNames.s.get(seriesKey)?.n ?? 'Cricket' },
    format: SERIES_MATCH_FORMAT[row.ft ?? 0] ?? 'T20',
    status: SERIES_MATCH_STATUS[row.s ?? 0] ?? 'UPCOMING',
    venue: rowNames.v.get(cleanKey(row.vf))?.n ?? 'TBD',
    venueId: cleanKey(row.vf) || null,
    startTime: new Date(row.t as number).toISOString(),
    result: null,
  }));

  const upcoming: Match[] = [];
  const seenUpcoming = new Set<string>();
  for (const m of [...fromEndpoint, ...mine.filter((f) => f.status !== 'COMPLETED')].sort(
    bySoonest
  )) {
    // Keyed on the match where crex has allocated one and on the fixture's shape
    // where it has not — the same match arrives from both sources with a key
    // from one of them and a preview id from the other. The two preview ids agree
    // (same series, same row id), but only where both sources list the fixture;
    // the shape is what catches the rest.
    const dedupe = parseScheduledMatchId(m.id)
      ? `${m.homeTeam.id}-${m.awayTeam.id}-${m.startTime.slice(0, 10)}`
      : m.id;
    if (seenUpcoming.has(dedupe)) continue;
    seenUpcoming.add(dedupe);
    upcoming.push(m);
  }

  // --- Recent: finished matches out of the corpus ----------------------------
  const recent = mine
    .filter((m) => m.status === 'COMPLETED' && m.result)
    .sort(byNewest)
    .map((m) => toHeadToHeadMatch(m, m.id));

  const form = recent
    .filter((m) => m.winnerKey || /draw|tie|no result|abandon/i.test(m.result))
    .slice(0, FORM_LENGTH)
    .map<'W' | 'L' | 'N'>((m) =>
      !m.winnerKey ? 'N' : m.winnerKey === key ? 'W' : 'L'
    );

  // --- Squad: named per series, so the nearest competition wins --------------
  // The side's next match names it; failing that, their last one. A squad from
  // the tournament they are actually in is the only one worth showing.
  const squadSeriesKey =
    upcoming.find((m) => m.series.id)?.series.id ?? mine.sort(byNewest)[0]?.series.id ?? null;

  const squad = squadSeriesKey
    ? await getCrexTeamSquad(squadSeriesKey, key, opts).catch(() => [])
    : [];

  const squadSeriesName = squadSeriesKey
    ? (upcoming.find((m) => m.series.id === squadSeriesKey)?.series.name ??
       mine.find((m) => m.series.id === squadSeriesKey)?.series.name ??
       null)
    : null;

  return {
    team,
    colors: teamColors(entry),
    rankings,
    upcoming,
    recent,
    form,
    squad,
    squadSeries:
      squad.length && squadSeriesKey
        ? { id: squadSeriesKey, name: squadSeriesName ?? 'Current series' }
        : null,
  };
}
