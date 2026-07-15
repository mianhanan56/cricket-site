// CricketData.org (formerly CricAPI) provider.
// All upstream calls live here so the rest of the app depends only on our types.
import { incrementApiCall } from '../../lib/usage';
import type {
  CricApiMatch,
  CricApiScorecardResponse,
  CricApiSeries,
  CricketProvider,
} from './types';

const BASE_URL = process.env.CRICKET_API_URL ?? 'https://api.cricapi.com/v1';
const apiKey = () => process.env.CRICAPI_KEY ?? '';

export const isConfigured: CricketProvider['isConfigured'] = () => Boolean(apiKey());

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

export const fetchLiveMatches: CricketProvider['fetchLiveMatches'] = () =>
  call<CricApiMatch[]>('currentMatches', { offset: '0' });

export const fetchMatchInfo: CricketProvider['fetchMatchInfo'] = (id) =>
  call<CricApiMatch>('match_info', { id });

export const fetchMatchScorecard: CricketProvider['fetchMatchScorecard'] = (id) =>
  call<CricApiScorecardResponse>('match_scorecard', { id });

export const fetchFixtures: CricketProvider['fetchFixtures'] = () =>
  call<CricApiMatch[]>('matches', { offset: '0' });

export const fetchSeriesList: CricketProvider['fetchSeriesList'] = () =>
  call<CricApiSeries[]>('series', { offset: '0' });
