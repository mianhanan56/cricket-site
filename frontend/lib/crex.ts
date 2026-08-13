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
  BatsmanLine,
  BowlerLine,
  CommentaryBall,
  InningsScore,
  Match,
  MatchFormat,
  MatchStatus,
  SeriesSummary,
  Team,
} from '@/types';

// The home page has no other source now, so this falls back to the deployed
// Worker rather than to '' — an unset env var used to mean "no crex", which now
// means "no matches at all". Override it to point at a local `wrangler dev`.
const DEFAULT_WORKER_URL = 'https://pulsecrease-crex.pulse-cricket.workers.dev';

export const CREX_WORKER_URL = process.env.NEXT_PUBLIC_CREX_WORKER_URL ?? DEFAULT_WORKER_URL;

export const isCrexConfigured = () => Boolean(CREX_WORKER_URL);

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
  /** Result text, sometimes crex-encoded ("&20wBi") — prefer `res`. */
  a?: string;
  /** Qualifier on the status, e.g. "due to rain". */
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
  /** Team 1 score, "282/6(50.0" — note the unclosed paren. */
  j?: string;
  /** Team 2 score. */
  k?: string;
  /** Series key, usually "^"-prefixed. */
  q: string;
  /** Human-readable status/result: "Innings Break", "UAE won by 97 runs". */
  res?: string;
  /** Start time, epoch ms. Occasionally a countdown string ("02h : 23m"). */
  ti: number | string;
  /** Venue key. Resolve via /mapping `v`. */
  v: string;
  /** Set once the match is over. The most reliable completion signal. */
  finishTime?: number;
  /** State code: 0-3 upcoming, 4-7 live, 8+ finished. `finishTime` is safer. */
  n?: number;
}

/** /matches/live returns an object keyed by match id, not an array. */
export type CrexMatchesResponse = Record<string, CrexRawMatch>;

interface CrexMapEntry {
  f_key: string;
  /** Full name. */
  n: string;
  /** Short name — teams only. */
  sn?: string;
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
 * crex counts balls, not overs, everywhere on the wire. Six per over — except
 * on The Hundred, where their own scorecard divides by five. Nothing in the
 * scorecard payload says which, so the caller passes it down from the match.
 */
const BALLS_PER_OVER = 6;

/** 27 balls -> 4.3 overs. Cricket notation, not a decimal fraction. */
function toOvers(balls: number, perOver: number): number {
  return Math.floor(balls / perOver) + (balls % perOver) / 10;
}

async function crexGet<T>(path: string, opts: FetchOpts = {}): Promise<T> {
  if (!CREX_WORKER_URL) {
    throw new Error('NEXT_PUBLIC_CREX_WORKER_URL is not set');
  }

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

/** crex prefixes some keys with "^" on the match object but not in the map. */
const cleanKey = (key: string | undefined): string => (key ?? '').replace(/^\^/, '');

/** Fetch whatever is missing from the cache, then return the whole cache. */
export async function resolveNames(
  matches: CrexRawMatch[],
  opts: FetchOpts = {}
): Promise<typeof nameCache> {
  const wanted: Record<CrexMapKind, Set<string>> = { t: new Set(), v: new Set(), s: new Set(), p: new Set() };

  for (const m of matches) {
    for (const [kind, key] of [['t', m.b], ['t', m.c], ['v', m.v], ['s', m.q]] as const) {
      const clean = cleanKey(key);
      if (clean && !nameCache[kind].has(clean)) wanted[kind].add(clean);
    }
  }

  const missing = Object.fromEntries(
    Object.entries(wanted).filter(([, set]) => set.size).map(([kind, set]) => [kind, [...set]])
  ) as Partial<Record<CrexMapKind, string[]>>;

  if (Object.keys(missing).length) {
    const mapping = await getCrexMapping(missing, opts);
    for (const kind of ['t', 'v', 's', 'p'] as const) {
      for (const entry of mapping[kind] ?? []) nameCache[kind].set(entry.f_key, entry);
    }
  }

  return nameCache;
}

// ---------------------------------------------------------------------------
// Adapters onto our own vocabulary (@/types)
// ---------------------------------------------------------------------------

/**
 * `finishTime` is set the moment a match ends and never unset, which makes it a
 * far better signal than the `n` state code (whose bands shift between formats).
 * Anything with a score but no finish time is in progress — including the
 * mid-match states crex reports as results ("Innings Break", "Stumps").
 */
export function toMatchStatus(m: CrexRawMatch): MatchStatus {
  if (m.finishTime) return 'COMPLETED';
  if (m.j || m.k) return 'LIVE';
  return 'UPCOMING';
}

/**
 * crex's `fo` covers more formats than our schema does. "List A" and "One Day"
 * are 50-over games, so they fold into ODI; T10 and The Hundred fold into T20
 * as the nearest of our three.
 *
 * The Hundred is checked first and via `hb`, not `fo`: crex sends no `fo` at
 * all on those matches, so anything relying on the label alone mislabels a
 * 100-ball game as an ODI.
 */
export function toMatchFormat(m: CrexRawMatch): MatchFormat {
  if (m.hb) return 'T20';

  const f = (m.fo ?? '').toUpperCase();
  if (f.includes('TEST')) return 'TEST';
  if (f.includes('T20') || f.includes('T10') || f.includes('HUN')) return 'T20';
  return 'ODI';
}

/** "282/6(50.0" -> { runs: 282, wickets: 6, overs: 50 }. Tolerates the missing paren. */
function parseScore(score: string | undefined, teamShortName: string): InningsScore | null {
  if (!score) return null;

  const m = /^(\d+)\/(\d+)\s*\(?\s*([\d.]+)?/.exec(score.trim());
  if (!m) return null;

  return {
    teamShortName,
    runs: Number(m[1]),
    wickets: Number(m[2]),
    overs: Number(m[3] ?? 0),
  };
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

/**
 * Build one of our `Match` objects from a crex match plus the resolved names.
 *
 * Unresolved keys degrade to the key itself rather than throwing — a match with
 * an unknown team still renders, just with "X6" where a name should be.
 */
export function toMatch(id: string, m: CrexRawMatch, names: typeof nameCache): Match {
  const homeTeam = toTeam(m.b, names);
  const awayTeam = toTeam(m.c, names);

  const innings = [
    parseScore(m.j, homeTeam.shortName),
    parseScore(m.k, awayTeam.shortName),
  ].filter((i): i is InningsScore => i !== null);

  const seriesKey = cleanKey(m.q);
  const status = toMatchStatus(m);

  return {
    id,
    homeTeam,
    awayTeam,
    series: { id: seriesKey, name: names.s.get(seriesKey)?.n ?? 'Cricket' },
    format: toMatchFormat(m),
    status,
    venue: names.v.get(cleanKey(m.v))?.n ?? 'TBD',
    startTime: toStartTime(m.ti),
    // `hb` carries the balls-per-over on The Hundred and is absent elsewhere.
    ballsPerOver: m.hb === 5 ? 5 : BALLS_PER_OVER,
    // `res` carries mid-match states too, so only surface it as a result once
    // the match is actually over.
    result: status === 'COMPLETED' ? m.res ?? m.a ?? null : null,
    scorecard: innings.length ? { innings } : null,
  };
}

/**
 * A single match by crex key, or null if crex no longer lists it.
 *
 * Reads the same list endpoint rather than crex's per-match ones: those return
 * a heavily encoded live-state blob (`"l":"43:1.1.6.2.W.1"`) that we do not
 * decode, and the list already carries everything this app renders. It also
 * means the detail page shares the Worker's cache entry with the home page.
 */
export async function getCrexMatch(id: string, opts: FetchOpts = {}): Promise<Match | null> {
  const raw = await getCrexMatches(opts);
  const match = raw[id];
  if (!match) return null;

  const names = await resolveNames([match], opts);
  return toMatch(id, match, names);
}

/**
 * One call for the common case: fetch the match list, resolve whatever names
 * are new, and hand back finished `Match` objects sorted newest-first.
 */
export async function getCrexMatchList(opts: FetchOpts = {}): Promise<Match[]> {
  const raw = await getCrexMatches(opts);
  const entries = Object.entries(raw);
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
    overs: toOvers(b, perOver),
    maidens: Number(maidens) || 0,
    runs: r,
    wickets: Number(wickets) || 0,
    economy: b ? Math.round((r / (b / perOver)) * 100) / 100 : 0,
  };
}

/** The Worker caps /mapping at 200 keys per bucket, so ask in batches. */
const MAPPING_BATCH = 200;

/** Resolve any player keys we have not seen before, into the shared cache. */
async function cachePlayerNames(keys: string[], opts: FetchOpts): Promise<void> {
  const missing = [...new Set(keys.filter((k) => k && !nameCache.p.has(k)))];
  if (!missing.length) return;

  const batches: Promise<CrexMapping>[] = [];
  for (let i = 0; i < missing.length; i += MAPPING_BATCH) {
    batches.push(getCrexMapping({ p: missing.slice(i, i + MAPPING_BATCH) }, opts));
  }

  for (const mapping of await Promise.all(batches)) {
    for (const entry of mapping.p ?? []) nameCache.p.set(entry.f_key, entry);
  }
}

/** Innings totals, batting and bowling cards for a crex match, in order. */
export async function getCrexScorecard(
  matchKey: string,
  opts: FetchOpts & { ballsPerOver?: number } = {}
): Promise<InningsScore[]> {
  const perOver = opts.ballsPerOver || BALLS_PER_OVER;

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

  const [, teamMapping] = await Promise.all([
    cachePlayerNames(playerKeys.filter(Boolean), opts),
    getCrexMapping({ t: teamKeys }, opts),
  ]);
  for (const entry of teamMapping.t ?? []) nameCache.t.set(entry.f_key, entry);

  return innings.flatMap((inn) => {
    const total = /^(\d+)\/(\d+)\((\d+)/.exec(inn.d ?? '');
    const teamKey = cleanKey(inn.c);
    const balls = total ? Number(total[3]) : 0;
    const lines = inn.b ?? [];

    // Nothing at all — not even an XI — is an innings crex is holding a slot
    // for. Emitting it would put a phantom "0/0" on the scorecard.
    if (!total && !lines.length) return [];

    return {
      teamShortName: nameCache.t.get(teamKey)?.sn ?? teamKey,
      runs: total ? Number(total[1]) : 0,
      wickets: total ? Number(total[2]) : 0,
      overs: toOvers(balls, perOver),
      // An innings with an XI but no total has not begun. Callers use this to
      // keep a "0/0" out of the header while still listing the side.
      notStarted: !total,
      extras: (inn.e ?? '').split('.').reduce((sum, n) => sum + (Number(n) || 0), 0),
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
}

// ---------------------------------------------------------------------------
// Commentary
// ---------------------------------------------------------------------------

interface CrexBallFeed {
  /** Runs off the ball as a string, or "W" for a wicket, "WD" for a wide. */
  b?: string;
  /** Over.ball, e.g. "48.2". */
  o?: string | number;
  /** Headline, "Bowler to Batsman". */
  c1?: string;
  /** Descriptive text. Often empty on minor events. */
  c2?: string;
  /** Event kind: "b" ball, "w" wicket, "o" over summary, plus others. */
  type?: string;
  /** Epoch ms. */
  id?: number;
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

    const balls = feed.filter((f) => f.type === 'b' || f.type === 'w').length;
    if (balls >= MIN_BALLS) break;

    cursor = String(batch[batch.length - 1].id ?? '');
    if (!cursor) break;
  }

  return feed
    .filter((f) => f.type === 'b' || f.type === 'w')
    .map((f) => {
      const [over, ball] = String(f.o ?? '').split('.');
      const isWicket = f.b === 'W' || f.type === 'w';
      const runs = isWicket ? 0 : Number(f.b) || 0;
      const text = [f.c1, f.c2].filter(Boolean).join(' — ');

      return {
        id: String(f.id ?? `${over}.${ball}`),
        over: Number(over) || 0,
        ball: Number(ball) || 0,
        runs,
        isWicket,
        isBoundary: runs === 4 || runs === 6,
        text,
        timestamp: f.id ? new Date(f.id).toISOString() : undefined,
      } satisfies CommentaryBall;
    })
    .filter((b) => Boolean(b.text));
}

// ---------------------------------------------------------------------------
// Series
// ---------------------------------------------------------------------------

/**
 * Roll the match list up into series.
 *
 * The backend's own series endpoint counts only matches synced into our DB,
 * which is why a full season shows as "1 match". Grouping the crex feed instead
 * gives a count that matches what a user can actually click through to, at no
 * extra request — the matches are already in hand.
 *
 * Caveat worth knowing: crex's feed is a window (live, upcoming and recently
 * finished), not a whole season, so this is "matches currently listed for this
 * series" rather than a season total. For an in-progress series that is the
 * number people care about; for a finished one it undercounts, which is
 * academic here because completed series are filtered out of the UI.
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

    // A series is live if anything in it is live; otherwise upcoming if
    // anything is still to come. Only when neither holds is it done.
    const status: MatchStatus = list.some((m) => m.status === 'LIVE')
      ? 'LIVE'
      : list.some((m) => m.status === 'UPCOMING')
        ? 'UPCOMING'
        : 'COMPLETED';

    // Formats can be mixed on a tour (a Test series followed by ODIs); the most
    // common one is the fairest single label.
    const tally = new Map<MatchFormat, number>();
    for (const m of list) tally.set(m.format, (tally.get(m.format) ?? 0) + 1);
    const format = [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];

    summaries.push({
      id,
      name: list[0].series.name,
      format,
      status,
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
