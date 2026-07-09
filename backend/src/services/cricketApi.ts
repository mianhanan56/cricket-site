// CricketData.org (formerly CricAPI) integration.
// All upstream calls live here so the rest of the app depends only on our types.
import { incrementApiCall } from '../lib/usage';
import type { BatsmanLine, BowlerLine } from '../shared/types';

const BASE_URL = process.env.CRICKET_API_URL ?? 'https://api.cricapi.com/v1';
const apiKey = () => process.env.CRICAPI_KEY ?? '';

export interface CricApiMatch {
  id: string;
  name: string;
  matchType?: string; // t20 | odi | test
  status: string; // human text
  venue?: string;
  date?: string; // YYYY-MM-DD
  dateTimeGMT?: string; // ISO
  teams?: string[];
  teamInfo?: Array<{ name: string; shortname?: string; img?: string }>;
  score?: Array<{ r: number; w: number; o: number; inning: string }>;
  series_id?: string;
  matchStarted?: boolean;
  matchEnded?: boolean;
}

// Shape of one innings in CricAPI's `match_scorecard` response. Field names use
// CricAPI's exact keys (`4s`, `sr`, `dismissal-text`, `eco`).
export interface CricApiInningsCard {
  inning: string;
  batting?: Array<{
    batsman?: { id?: string; name?: string };
    'dismissal-text'?: string;
    r?: number;
    b?: number;
    '4s'?: number;
    '6s'?: number;
    sr?: number;
  }>;
  bowling?: Array<{
    bowler?: { id?: string; name?: string };
    o?: number;
    m?: number;
    r?: number;
    w?: number;
    eco?: number;
  }>;
  extras?: Record<string, number>;
  totals?: Record<string, number>;
}

export interface CricApiScorecardResponse extends CricApiMatch {
  scorecard?: CricApiInningsCard[];
}

export interface CricApiSeries {
  id: string;
  name: string;
  startDate?: string;
  endDate?: string;
  matches?: number;
}

interface Envelope<T> {
  apikey?: string;
  data?: T;
  status: string; // "success" | "failure"
  reason?: string;
}

async function call<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const key = apiKey();
  if (!key) throw new Error('CRICAPI_KEY is not configured');

  const url = new URL(`${BASE_URL}/${path}`);
  url.searchParams.set('apikey', key);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  // Count every upstream call toward the daily quota.
  await incrementApiCall();

  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`CricAPI ${path} HTTP ${res.status}`);

  const body = (await res.json()) as Envelope<T>;
  if (body.status !== 'success') {
    throw new Error(`CricAPI ${path}: ${body.reason ?? body.status}`);
  }
  return (body.data ?? []) as T;
}

// --- Endpoints --------------------------------------------------------------

/** Currently live + recent matches. */
export const fetchLiveMatches = () => call<CricApiMatch[]>('currentMatches', { offset: '0' });

/** Full match detail (incl. scorecard) by upstream match id. */
export const fetchMatchInfo = (id: string) => call<CricApiMatch>('match_info', { id });

/** Per-innings batting/bowling scorecard by upstream match id. */
export const fetchMatchScorecard = (id: string) =>
  call<CricApiScorecardResponse>('match_scorecard', { id });

/** Upcoming / scheduled matches. */
export const fetchFixtures = () => call<CricApiMatch[]>('matches', { offset: '0' });

/** Current series list. */
export const fetchSeriesList = () => call<CricApiSeries[]>('series', { offset: '0' });

// --- Mapping helpers (CricAPI shape -> our schema) --------------------------

export function mapStatus(m: CricApiMatch): 'LIVE' | 'UPCOMING' | 'COMPLETED' {
  const text = (m.status ?? '').toLowerCase();
  const isResultText =
    text.includes('result') ||
    text.includes('won') ||
    text.includes('beat') ||
    text.includes('draw') ||
    text.includes('tie') ||
    text.includes('abandon') ||
    text.includes('no result');

  // 1) Finished — authoritative API flag or a result-bearing status string.
  if (m.matchEnded || isResultText) return 'COMPLETED';

  // 2) Live — explicit "live" text or the API's in-progress flag (keeps
  //    multi-day Tests live even when the status text has no "live" word).
  if (text.includes('live') || m.matchStarted) return 'LIVE';

  // 3) Explicitly upcoming.
  if (text.includes('upcoming') || text.includes('not started')) return 'UPCOMING';

  // 4) Fallback — scheduled time is in the past and nothing marks it live, so
  //    treat it as completed (covers stale rows the API never flagged ended).
  if (m.dateTimeGMT) {
    const start = new Date(m.dateTimeGMT).getTime();
    if (!Number.isNaN(start) && start < Date.now()) return 'COMPLETED';
  }

  return 'UPCOMING';
}

export function mapFormat(m: CricApiMatch): 'TEST' | 'ODI' | 'T20' {
  const t = (m.matchType ?? '').toLowerCase();
  if (t.includes('test')) return 'TEST';
  if (t.includes('t20') || t.includes('t10')) return 'T20';
  return 'ODI';
}

export function mapStartTime(m: CricApiMatch): Date {
  if (m.dateTimeGMT) return new Date(m.dateTimeGMT);
  if (m.date) return new Date(m.date);
  return new Date();
}

/** Build our scorecard JSON from CricAPI's `score` array. */
export function mapScorecard(m: CricApiMatch) {
  const innings = (m.score ?? []).map((s) => ({
    teamShortName: (s.inning ?? '').replace(/ Inning.*/i, '').trim(),
    inning: s.inning,
    runs: s.r,
    wickets: s.w,
    overs: s.o,
  }));
  return { innings, statusText: m.status, raw: m.score ?? [] };
}

// A batsman is "not out" when there's no dismissal text, or it explicitly says
// so (CricAPI uses "not out" / "batting" for undismissed, "" for did-not-bat).
function isOut(text: string): boolean {
  const t = text.trim().toLowerCase();
  return t !== '' && !t.includes('not out') && t !== 'batting';
}

function mapBatting(list: CricApiInningsCard['batting'] = []): BatsmanLine[] {
  return list.map((b, i) => {
    const text = (b['dismissal-text'] ?? '').trim();
    return {
      playerId: b.batsman?.id ?? b.batsman?.name ?? `bat-${i}`,
      name: b.batsman?.name ?? 'Unknown',
      runs: b.r ?? 0,
      balls: b.b ?? 0,
      fours: b['4s'] ?? 0,
      sixes: b['6s'] ?? 0,
      strikeRate: b.sr ?? 0,
      out: isOut(text),
      dismissal: text || 'not out',
    };
  });
}

function mapBowling(list: CricApiInningsCard['bowling'] = []): BowlerLine[] {
  return list.map((b, i) => ({
    playerId: b.bowler?.id ?? b.bowler?.name ?? `bowl-${i}`,
    name: b.bowler?.name ?? 'Unknown',
    overs: b.o ?? 0,
    maidens: b.m ?? 0,
    runs: b.r ?? 0,
    wickets: b.w ?? 0,
    economy: b.eco ?? 0,
  }));
}

// CricAPI extras is an object like {b, lb, w, nb, p, total}. Prefer its own
// total; else sum the numeric parts. Returns undefined when there are none.
function extrasTotal(extras?: Record<string, number>): number | undefined {
  if (!extras) return undefined;
  if (typeof extras.total === 'number') return extras.total;
  const sum = Object.values(extras).reduce((a, v) => a + (typeof v === 'number' ? v : 0), 0);
  return sum > 0 ? sum : undefined;
}

/**
 * Merge CricAPI's per-innings scorecard into an existing scorecard's innings,
 * matching by the `inning` label. Keeps the stored innings totals (runs/wickets
 * /overs) and attaches batting/bowling/extras. Returns a new scorecard object.
 */
export function mergeScorecardDetail(
  existing: { innings?: Array<Record<string, unknown>>; [k: string]: unknown },
  cards: CricApiInningsCard[]
) {
  const norm = (s: string) => s.trim().toLowerCase();
  const byLabel = new Map(cards.map((c) => [norm(c.inning ?? ''), c]));

  const baseInnings = existing.innings ?? [];
  // Start from stored innings so totals/short names are preserved; fall back to
  // the card list if we have no stored innings yet.
  const source = baseInnings.length
    ? baseInnings
    : cards.map((c) => ({ inning: c.inning, teamShortName: (c.inning ?? '').replace(/ Inning.*/i, '').trim() }));

  const innings = source.map((inn) => {
    const label = norm(String((inn as { inning?: string }).inning ?? ''));
    const card = byLabel.get(label);
    if (!card) return inn;
    return {
      ...inn,
      batting: mapBatting(card.batting),
      bowling: mapBowling(card.bowling),
      extras: extrasTotal(card.extras),
    };
  });

  return { ...existing, innings };
}
