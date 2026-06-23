// CricketData.org (formerly CricAPI) integration.
// All upstream calls live here so the rest of the app depends only on our types.
import { incrementApiCall } from '../lib/usage';

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

/** Upcoming / scheduled matches. */
export const fetchFixtures = () => call<CricApiMatch[]>('matches', { offset: '0' });

/** Current series list. */
export const fetchSeriesList = () => call<CricApiSeries[]>('series', { offset: '0' });

// --- Mapping helpers (CricAPI shape -> our schema) --------------------------

export function mapStatus(m: CricApiMatch): 'LIVE' | 'UPCOMING' | 'COMPLETED' {
  if (m.matchEnded) return 'COMPLETED';
  if (m.matchStarted) return 'LIVE';
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
