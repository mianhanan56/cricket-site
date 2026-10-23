// The live match list (/matches/live) and its decode into our `Match`.
import type { InningsScore, Match, MatchFormat, MatchStatus, PlayerOfMatch, Team } from '@/types';
import { DEFAULT_BALLS_PER_OVER, HUNDRED_BALLS_PER_OVER } from '../overs';
import { attributeResult } from './attribution';
import { apiGet, type FetchOpts } from './client';
import { HUNDRED_BALLS } from './codes';
import { cleanKey, resolveKeys, seriesRef, toTeam, venueOf, type NameCache } from './names';
import { decodeMatchNote, inningsBreakNote, pickNote } from './notes';
import { getApiArchivedMatch } from './schedule';

/** One match as the upstream sends it. Only the fields we read; meanings checked against live data. */
export interface ApiRawMatch {
  /**
   * Status code, decoded by `decodeMatchNote`: "$a".."$x" from the upstream's status table
   * (older payloads send the bare letter), "^0".."^3" the toss, "&…" compressed
   * result text (not decoded; `res` says the same in plain English).
   */
  a?: string;
  /** Qualifier on the status, e.g. "(wet outfield)". */
  ac?: string;
  /** Team 1 key. */
  b: string;
  /** Team 2 key. */
  c: string;
  /** Match number within the series, as a string; "0" or absent when unnumbered. */
  e?: string;
  /** Format label: "ODI" | "Test" | "T20" | "List A" | "One Day". Absent on The Hundred and some T10s. */
  fo?: string;
  /** Balls per over on The Hundred (5); absent elsewhere. */
  hb?: number;
  /**
   * Innings slots in batting order: j and k the first innings of team 1 and 2, l and m
   * the second (Tests). "282/6(50.0" — the paren is never closed; a leading "!" is a declaration.
   */
  j?: string;
  k?: string;
  l?: string;
  m?: string;
  /** Innings in progress: 1–2 the first innings, 3–6 the second; odd means team 1 is batting. */
  d?: number;
  /** Series key, usually "^"-prefixed. */
  q: string;
  /** Status or result in words: "Innings Break", "UAE won by 97 runs". */
  res?: string;
  /** Multi-day only, "2/1/135": the first figure is the session in play. */
  s?: string;
  /** Start time, epoch ms. Occasionally a countdown string ("02h : 23m"). */
  ti: number | string;
  /** Venue key. */
  v: string;
  /** Set once the match is over. Only read when `n` is missing. */
  finishTime?: number;
  /** Packed format/state/day — read it through `decodeMatchState`, never as a threshold. */
  n?: number;
  /**
   * Player of the match, finished matches only: "CO.1GK.65(36).3/30" is player key,
   * team key, batting, bowling. A missing figure is the literal "-^-".
   */
  mm?: string;
  /** Set on over half the list, live Tests included. Not "don't show": use `isRenderableMatch`. */
  hide?: number;
}

/**
 * The upstream mixes stubs into the list (`wp` and nothing else) that would decode into a
 * blank card dated today. A real fixture always names both sides.
 */
export function isRenderableMatch(m: ApiRawMatch): boolean {
  return Boolean(cleanKey(m.b) && cleanKey(m.c));
}

/** Keyed by match id, not an array. */
export type ApiMatchesResponse = Record<string, ApiRawMatch>;

/** Every match the upstream knows about — live, upcoming and recently finished. */
export function getApiMatches(opts: FetchOpts = {}): Promise<ApiMatchesResponse> {
  return apiGet<ApiMatchesResponse>('/matches/live', { revalidate: 15, ...opts });
}

/** The teams, venues, series and award winners named by a batch of raw matches. */
export function resolveNames(
  matches: ApiRawMatch[],
  opts: FetchOpts = {}
): Promise<NameCache> {
  return resolveKeys(
    {
      t: matches.flatMap((m) => [m.b, m.c]),
      v: matches.map((m) => m.v),
      s: matches.map((m) => m.q),
      p: matches.map((m) => (m.mm ?? '').split('.')[0]).filter(Boolean),
    },
    opts
  );
}

// `n` packs three fields (the upstream's `liveHomeParsingMethod`):
//   format = n % 4            0 T20, 1 ODI, 2 Test, 3 T10/The Hundred
//   state  = ⌊(n % 12) / 4⌋   0 upcoming, 1 live, 2 finished
//   day    = ⌊n / 12⌋ + 1
// Read as a threshold ("8 and up is finished") it ends a Test after its first day.
const STATE_CYCLE = 12;
const FORMAT_SLOTS = 4;

const STATE_STATUS: Record<number, MatchStatus> = {
  0: 'UPCOMING',
  1: 'LIVE',
  2: 'COMPLETED',
};

/** Slot 3 is T10 or The Hundred; `toMatchFormat` tells them apart by `hb`. */
const SLOT_FORMAT: Record<number, MatchFormat> = {
  0: 'T20',
  1: 'ODI',
  2: 'TEST',
  3: 'T10',
};

export interface ApiMatchState {
  status: MatchStatus;
  format: MatchFormat;
  /** Day of play, 1-based; always 1 on single-day formats. */
  day: number;
}

/** Unpack the upstream's `n`. Returns null for a value that cannot be one. */
export function decodeMatchState(n: number | undefined): ApiMatchState | null {
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
 * Live / Upcoming / Finished. `n` is believed first — it is what the upstream's own site
 * switches on and it holds through stumps, rest days and breaks; `finishTime` and
 * the scores are the fallback for fixtures sent without it.
 */
export function toMatchStatus(m: ApiRawMatch): MatchStatus {
  const state = decodeMatchState(m.n);

  if (state) {
    // A stale "upcoming" over a match with an earlier day or a score is live.
    if (state.status === 'UPCOMING' && (state.day > 1 || m.j || m.k)) return 'LIVE';
    return state.status;
  }

  if (m.finishTime) return 'COMPLETED';
  return m.j || m.k ? 'LIVE' : 'UPCOMING';
}

/**
 * Our format from the upstream's label. The Hundred is checked by `hb` (it has no `fo`) and
 * folds into T20; List A / One Day fold into ODI; `n` covers the rest sent bare.
 */
export function toMatchFormat(m: ApiRawMatch): MatchFormat {
  if (m.hb) return 'T20';

  const f = (m.fo ?? '').toUpperCase();
  if (f.includes('TEST')) return 'TEST';
  if (f.includes('T10')) return 'T10';
  if (f.includes('T20') || f.includes('HUN')) return 'T20';
  if (f.includes('ODI') || f.includes('ONE DAY') || f.includes('LIST')) return 'ODI';

  return decodeMatchState(m.n)?.format ?? 'ODI';
}

/** "282/6(50.0" -> 282 for 6 in 50 overs. A "!" marks a declaration, kept as a flag. */
export function parseScore(score: string | undefined, teamShortName: string): InningsScore | null {
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
 * Every innings in the four slots, tagged with its side and number. The one in
 * progress comes from `d`, not from wickets: a declaration or an over limit can
 * close an innings at any wicket count.
 */
function feedInnings(
  m: ApiRawMatch,
  home: Team,
  away: Team,
  status: MatchStatus,
  format: MatchFormat
): InningsScore[] {
  const pair = (m.d ?? 1) <= 2 ? 1 : 2;
  const battingSide = (m.d ?? 1) % 2 === 1 ? 1 : 2;
  const swap = format === 'TEST' && followedOn(m, home, away, status);

  const slots: Array<{ raw?: string; team: Team; side: 1 | 2; inningsNumber: number }> = [
    { raw: m.j, team: home, side: 1, inningsNumber: 1 },
    { raw: m.k, team: away, side: 2, inningsNumber: 1 },
    swap
      ? { raw: m.l, team: away, side: 2, inningsNumber: 2 }
      : { raw: m.l, team: home, side: 1, inningsNumber: 2 },
    swap
      ? { raw: m.m, team: home, side: 1, inningsNumber: 2 }
      : { raw: m.m, team: away, side: 2, inningsNumber: 2 },
  ];

  const out: InningsScore[] = [];

  for (const slot of slots) {
    const parsed = parseScore(slot.raw, slot.team.shortName);
    if (!parsed) continue;
    // A finished match can carry a 0/0 in an innings nobody batted (the last one after an innings win).
    if (status === 'COMPLETED' && isUnplayed(parsed)) continue;

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

function sessionOf(raw: string | undefined): number | null {
  const n = Number(raw?.split('/')[0]);
  return Number.isInteger(n) && n >= 1 && n <= 3 ? n : null;
}

const isUnplayed = (inn: InningsScore): boolean => inn.runs === 0 && inn.wickets === 0 && inn.overs === 0;

/**
 * Did the side batting second go straight back in? The slots assume the sides
 * alternate, so a follow-on swaps the last two. Decided only where the feed proves
 * it: live from `d` (3 = team 1's second innings, 4 = team 2's) pointing at the other
 * slot; finished from who the result says batted last, or once (an innings win).
 * A draw says neither and stays as sent.
 */
function followedOn(m: ApiRawMatch, home: Team, away: Team, status: MatchStatus): boolean {
  if (!m.l) return false;
  const fourth = parseScore(m.m, '');
  const playedFourth = fourth !== null && !isUnplayed(fourth);

  if (status === 'LIVE') return (m.d === 4 && !playedFourth) || (m.d === 3 && playedFourth);
  if (status !== 'COMPLETED') return false;

  const { winnerKey, method } = attributeResult(m.res, home, away);
  if (!winnerKey) return false;
  if (/innings/i.test(m.res ?? '')) return winnerKey === home.id;
  if (!playedFourth || !method) return false;
  const batLast = method === 'CHASED' ? winnerKey : winnerKey === home.id ? away.id : home.id;
  return batLast === home.id;
}

/** The upstream sends epoch ms, but substitutes a countdown string on some fixtures. */
function toStartTime(ti: number | string): string {
  const ms = typeof ti === 'number' ? ti : Number(ti);
  return Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : new Date().toISOString();
}

/** The upstream's "this player has no figures of this kind" placeholder. */
const NO_FIGURES = '-^-';

const figures = (raw: string | undefined): string | null =>
  raw && raw !== NO_FIGURES ? raw : null;

/** The match award from `mm`, or null until the upstream names one (and on washouts). */
function decodePlayerOfMatch(
  m: ApiRawMatch,
  names: NameCache
): PlayerOfMatch | null {
  const [playerKey, teamKey, batting, bowling] = (m.mm ?? '').split('.');
  const player = cleanKey(playerKey);
  if (!player) return null;

  const team = cleanKey(teamKey);

  return {
    id: player,
    // An unresolved key prints as the key: the upstream names the award once, and dropping it is worse.
    name: names.p.get(player)?.n ?? player,
    teamId: team,
    teamShortName: names.t.get(team)?.sn ?? team,
    batting: figures(batting),
    bowling: figures(bowling),
  };
}

/** One of our matches from an upstream match plus the resolved names. */
export function toMatch(id: string, m: ApiRawMatch, names: NameCache): Match {
  const homeTeam = toTeam(m.b, names);
  const awayTeam = toTeam(m.c, names);

  const status = toMatchStatus(m);
  const state = decodeMatchState(m.n);
  const format = toMatchFormat(m);
  const innings = feedInnings(m, homeTeam, awayTeam, status, format);
  const perOver =
    m.hb === HUNDRED_BALLS_PER_OVER ? HUNDRED_BALLS_PER_OVER : DEFAULT_BALLS_PER_OVER;

  return {
    id,
    homeTeam,
    awayTeam,
    series: seriesRef(cleanKey(m.q), names),
    format,
    status,
    ...venueOf(m.v, names),
    startTime: toStartTime(m.ti),
    ballsPerOver: perOver,
    // Any `hb` marks a 100-ball game; the format alone (T20) would give a chase 20 balls too many.
    ballsLimit: m.hb ? HUNDRED_BALLS : null,
    // `res` carries mid-match states too, so it is only a result once the match is over.
    result: status === 'COMPLETED' ? resultText(m.res ?? m.a) : null,
    // Independent of `status`: a Test at stumps is LIVE with a STUMPS note.
    note: pickNote(
      decodeMatchNote(m, { first: homeTeam.shortName, second: awayTeam.shortName }),
      inningsBreakNote(innings, status, format, perOver),
      { innings, format, perOver }
    ),
    matchNumber: Number(m.e) > 0 ? Number(m.e) : null,
    day: state && state.format === 'TEST' ? state.day : null,
    session: status === 'LIVE' && format === 'TEST' ? sessionOf(m.s) : null,
    playerOfMatch: status === 'COMPLETED' ? decodePlayerOfMatch(m, names) : null,
    scorecard: innings.length ? { innings } : null,
  };
}

// For a while after the finish the upstream can leave the last stoppage in `res` ("Tea Break" on a won Test).
const STOPPAGE_TEXT = /\b(break|lunch|tea|drinks|stumps|timeout|delay(ed)?|rain|bad light|wet outfield)\b/i;
const RESULT_TEXT = /\b(won|wins?|draw|drawn|tied?|no result|abandon|cancel|super over|forfeit|conceded|awarded)/i;

/** A finished match's result line, or null while the upstream still shows a stoppage there. */
export function resultText(raw: string | null | undefined): string | null {
  const text = raw?.trim();
  if (!text) return null;
  return STOPPAGE_TEXT.test(text) && !RESULT_TEXT.test(text) ? null : text;
}

/**
 * One match by key, or null. The live list is tried first (one shared cache entry);
 * a match that has aged out of that window is rebuilt by `getApiArchivedMatch`.
 */
export async function getApiMatch(id: string, opts: FetchOpts = {}): Promise<Match | null> {
  const raw = await getApiMatches(opts);
  const match = raw[id];
  if (match && isRenderableMatch(match)) {
    const names = await resolveNames([match], opts);
    return toMatch(id, match, names);
  }

  return getApiArchivedMatch(id, opts).catch(() => null);
}

/** The match list with names resolved, newest first. */
export async function getApiMatchList(opts: FetchOpts = {}): Promise<Match[]> {
  return matchListFromRaw(await getApiMatches(opts), opts);
}

/** The same list from a body already in hand — a poll's, or the live socket's. */
export async function matchListFromRaw(raw: ApiMatchesResponse, opts: FetchOpts = {}): Promise<Match[]> {
  // Stubs are dropped before names are resolved, so they cost no mapping lookup.
  const entries = Object.entries(raw).filter(([, m]) => isRenderableMatch(m));
  const names = await resolveNames(entries.map(([, m]) => m), opts);

  return entries
    .map(([id, m]) => toMatch(id, m, names))
    .sort((a, b) => +new Date(b.startTime) - +new Date(a.startTime));
}
