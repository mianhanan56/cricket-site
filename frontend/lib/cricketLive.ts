// Client for the Cloudflare Worker that fronts CricLive API (see /worker).
//
// Separate from api.ts on purpose: api.ts talks to our own Express backend and
// unwraps its { success, data } envelope into our `IMatch`/`IScorecard` shapes.
// This module speaks CricLive's own vocabulary (snake_case, `first_team` /
// `second_team`, string scores) and leaves translation to the caller — see
// toMatchStatus/toMatchFormat at the bottom for the common conversions.
//
// Types below are written against real responses captured from the live API.

export const WORKER_URL = process.env.NEXT_PUBLIC_CRICKET_WORKER_URL ?? '';

// ---------------------------------------------------------------------------
// Response envelope
// ---------------------------------------------------------------------------

interface Envelope<T> {
  success: boolean;
  data: T;
}

interface MatchListEnvelope {
  success: boolean;
  type: 'live' | 'recent' | 'upcoming';
  count: number;
  data: CricLiveMatch[];
}

// ---------------------------------------------------------------------------
// Matches
// ---------------------------------------------------------------------------

export interface CricLiveInnings {
  innings_id: number;
  runs: number;
  wickets: number;
  overs: number;
  run_rate: string;
  balls_left: number | null;
  target: number | null;
  required_run_rate: string;
  is_declared: boolean;
  is_following_on: boolean;
}

export interface CricLiveTeam {
  id: number;
  name: string; // short form, e.g. "AFG"
  full_name: string;
  image_id: number | null;
  /** Pre-formatted, e.g. "299/8 (46.6 ov)". Empty before play starts. */
  score: string;
  innings: CricLiveInnings[];
  team_image_url: string;
}

export interface CricLiveMatch {
  match_id: number;
  series_id: number;
  series_name: string;
  match_desc: string; // "2nd ODI"
  title: string;
  format: string; // "ODI" | "T20" | "TEST" | …
  match_type: string; // "International" | "Domestic" | "League" | "Women"
  date: string; // "Aug 07, 09:45 GMT" — display string, not ISO
  end_date: string;
  venue: string;
  venue_timezone: string;
  venue_id: number;
  status_detail: string; // long form, may include rain/DLS notes
  short_status: string; // "Ireland need 166 runs"
  state: string; // "In Progress" | "Complete" | "Preview" | …
  is_time_announced: boolean;
  /** Required by the match-facts and live-scorecard endpoints. */
  slug: string;
  first_team: CricLiveTeam;
  second_team: CricLiveTeam;
  status: string;
}

// ---------------------------------------------------------------------------
// Live scorecard (miniscore)
// ---------------------------------------------------------------------------

export interface CricLiveBatter {
  id: number;
  name: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  strike_rate: string;
  profile_url: string;
}

export interface CricLiveBowler {
  id: number;
  name: string;
  overs: number;
  maidens: number;
  runs: number;
  wickets: number;
  economy: number;
  profile_url: string;
}

export interface CricLiveMiniscore {
  innings_id: number;
  bat_team_id: number;
  bat_team_score: number;
  bat_team_wickets: number;
  overs: number;
  crr: number;
  rrr: number;
  target: number;
  status: string;
  state: string;
  last_wicket: string;
  overs_remaining: number | null;
  recent_balls: string;
  event: string;
  partnership: { runs: number; balls: number };
  latest_performance: Array<{ runs: number; wkts: number; label: string }>;
  batter_striker: CricLiveBatter | null;
  batter_non_striker: CricLiveBatter | null;
  bowler_striker: CricLiveBowler | null;
  bowler_non_striker: CricLiveBowler | null;
}

export interface CricLiveScorecard {
  match_id: number;
  match_header: {
    match_id: number;
    description: string;
    format: string;
    state: string;
    status: string;
    toss: string;
    venue: string;
    complete: boolean;
  };
  innings: Array<{
    innings_id: number;
    bat_team_id: number;
    bat_team: string;
    score: number;
    wickets: number;
    overs: number;
    is_declared: boolean;
    is_follow_on: boolean;
  }>;
  live: CricLiveMiniscore;
}

// ---------------------------------------------------------------------------
// Series / schedule / teams / match facts
// ---------------------------------------------------------------------------

export type CricLiveCategory = 'all' | 'international' | 'domestic' | 'league' | 'women';

export interface CricLiveSeries {
  id: number;
  name: string;
  series_type: string | null;
  image_id: number | null;
  start_ms: number;
  end_ms: number;
  start_date: string; // "2024-02-15"
  end_date: string;
}

/** Series come grouped by month, e.g. "FEBRUARY 2024". */
export interface CricLiveSeriesByCategory {
  category: string;
  total: number;
  months: Array<{ month: string; series: CricLiveSeries[] }>;
}

export interface CricLiveTeamSummary {
  id: number;
  name: string;
  short_name: string;
  image_url: string;
  country: string;
}

export interface CricLiveTeamsByCategory {
  total: number;
  teams: CricLiveTeamSummary[];
}

export interface CricLiveMatchFacts {
  match_id: number;
  match_info: Record<string, unknown>;
  toss: unknown;
  umpires: unknown;
  referee: unknown;
  venue: unknown;
  venue_details: unknown;
  broadcast: unknown;
  team1_squad: unknown;
  team2_squad: unknown;
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

interface FetchOpts {
  /** Next.js ISR window in seconds. Defaults to the endpoint's upstream TTL. */
  revalidate?: number;
  cache?: RequestCache;
}

async function workerGet<T>(path: string, opts: FetchOpts = {}): Promise<T> {
  if (!WORKER_URL) {
    throw new Error('NEXT_PUBLIC_CRICKET_WORKER_URL is not set');
  }

  const res = await fetch(`${WORKER_URL.replace(/\/$/, '')}${path}`, {
    headers: { Accept: 'application/json' },
    next: opts.revalidate !== undefined ? { revalidate: opts.revalidate } : undefined,
    cache: opts.cache,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw Object.assign(new Error(`Worker ${path} failed: ${res.status} ${detail.slice(0, 200)}`), {
      status: res.status,
    });
  }

  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Public endpoints — no token needed upstream
// ---------------------------------------------------------------------------

/** All live and preview matches. Upstream TTL 15s. */
export async function getLiveMatches(): Promise<CricLiveMatch[]> {
  const body = await workerGet<MatchListEnvelope>('/cricket/matches/live', { revalidate: 15 });
  return body.data ?? [];
}

/** Recently completed matches. Upstream TTL 5m. */
export async function getRecentMatches(): Promise<CricLiveMatch[]> {
  const body = await workerGet<MatchListEnvelope>('/cricket/matches/recent', { revalidate: 300 });
  return body.data ?? [];
}

/** Scheduled upcoming matches. Upstream TTL 5m. */
export async function getUpcomingMatches(): Promise<CricLiveMatch[]> {
  const body = await workerGet<MatchListEnvelope>('/cricket/matches/upcoming', { revalidate: 300 });
  return body.data ?? [];
}

export async function getSeriesByCategory(
  category: CricLiveCategory = 'international'
): Promise<CricLiveSeriesByCategory> {
  const body = await workerGet<Envelope<CricLiveSeriesByCategory>>(`/cricket/series/${category}`, {
    revalidate: 300,
  });
  return body.data;
}

/** Upcoming schedule grouped by date. */
export async function getSchedule(category: CricLiveCategory = 'international'): Promise<unknown[]> {
  const body = await workerGet<Envelope<unknown[]>>(`/cricket/schedule/${category}`, {
    revalidate: 300,
  });
  return body.data ?? [];
}

export async function getTeamsByCategory(
  category: CricLiveCategory = 'international'
): Promise<CricLiveTeamSummary[]> {
  const body = await workerGet<Envelope<CricLiveTeamsByCategory>>(`/cricket/teams/${category}`, {
    revalidate: 3600,
  });
  return body.data?.teams ?? [];
}

/**
 * Live miniscore — current batters, bowler, CRR/RRR, partnership.
 * `slug` comes from the match object's `slug` field.
 */
export async function getLiveScorecard(
  matchId: number | string,
  slug: string
): Promise<CricLiveScorecard> {
  const body = await workerGet<Envelope<CricLiveScorecard>>(
    `/cricket/live-scorecard/${matchId}/${encodeURIComponent(slug)}`,
    { revalidate: 15 }
  );
  return body.data;
}

/** Toss, umpires, referee, venue and squads. */
export async function getMatchFacts(
  matchId: number | string,
  slug: string
): Promise<CricLiveMatchFacts> {
  const body = await workerGet<Envelope<CricLiveMatchFacts>>(
    `/cricket/match-facts/${matchId}/${encodeURIComponent(slug)}`,
    { revalidate: 300 }
  );
  return body.data;
}

// ---------------------------------------------------------------------------
// Protected endpoints — need CRICKET_API_TOKEN set on the Worker. Without it the
// Worker returns 503 with a hint. Verified working on the FREE plan.
// ---------------------------------------------------------------------------

export interface CricLiveScorecardBatsman {
  name: string;
  short_name: string;
  is_captain: boolean;
  is_keeper: boolean;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  strike_rate: number;
  /** "c Hollman b Brookes" | "not out" */
  out_desc: string;
  wicket_code: string; // "CAUGHT" | "BOWLED" | "" while not out
  mins: number;
  dots: number;
}

export interface CricLiveScorecardBowler {
  name: string;
  short_name: string;
  is_captain: boolean;
  overs: number;
  maidens: number;
  runs: number;
  wickets: number;
  no_balls: number;
  wides: number;
  economy: number;
  dots: number;
}

export interface CricLiveFullInnings {
  bat_team: string;
  bat_team_short: string;
  bowl_team: string;
  score: string; // "303/7 (50 ov)"
  run_rate: number;
  /** Always 0 in this payload — use array position for the innings number. */
  innings_id: number;
  batsmen: CricLiveScorecardBatsman[];
  bowlers: CricLiveScorecardBowler[];
  yet_to_bat: unknown[];
  extras: string; // display string
  extras_detail: {
    total: number;
    byes: number;
    leg_byes: number;
    wides: number;
    no_balls: number;
    penalty: number;
  };
  fall_of_wickets: unknown[];
  partnerships: unknown[];
  is_declared: boolean;
  is_following_on: boolean;
}

export interface CricLiveFullScorecard {
  match_id: number;
  match_header: { name: string; location: string; start_date: string };
  /** Capped at two innings upstream — a four-innings Test returns only 1 and 2. */
  innings: CricLiveFullInnings[];
}

export interface CricLiveCommentaryBall {
  timestamp: number; // epoch ms
  text: string;
  ball_metric: number; // 28.6 = over 28, ball 6
  innings_id: number;
  /** Present only on the ball that closes an over. */
  over_separator: {
    over_number: number;
    over_summary: string; // "0 4 1 4 0 0 "
    over_runs: number;
    bat_team_score: string; // "165-2"
    striker: string; // "43(46)"
    non_striker: string;
    bowler: string; // "5-0-35-0"
  } | null;
}

export interface CricLiveCommentary {
  match_id: number;
  match_header: Record<string, unknown>;
  miniscore: CricLiveMiniscore | null;
  commentary: CricLiveCommentaryBall[];
  /** Null unless CricLive has a model for the match. */
  win_probability: { home?: number; away?: number } | null;
}

export interface CricLiveSquad {
  team_id: number;
  team_name: string;
  team_short: string;
  playing_xi: unknown[];
  bench: unknown[];
  support_staff: unknown[];
}

export interface CricLiveHighlight {
  over: number;
  innings_id: number;
  /** Comma-joined, e.g. "TEAM_HUNDRED,FOUR". */
  event: string;
  bat_team: string;
  text: string;
  batsman: string;
  batsman_runs: number;
  batsman_balls: number;
  bowler: string;
  bowler_overs: number;
  bowler_wickets: number;
}

/** Featured live scores (~6 matches). Prefer getLiveMatches() for the full set. */
export async function getFeaturedLive(): Promise<CricLiveMatch[]> {
  const body = await workerGet<Envelope<CricLiveMatch[]>>('/cricket/live', { revalidate: 15 });
  return body.data ?? [];
}

/** Full batting/bowling scorecard. Upstream returns at most two innings. */
export async function getFullScorecard(matchId: number | string): Promise<CricLiveFullScorecard> {
  const body = await workerGet<Envelope<CricLiveFullScorecard>>(
    `/cricket/match/${matchId}/scorecard`,
    { revalidate: 30 }
  );
  return body.data;
}

/** Ball-by-ball commentary, newest first, plus win probability when available. */
export async function getCommentary(matchId: number | string): Promise<CricLiveCommentary> {
  const body = await workerGet<Envelope<CricLiveCommentary>>(
    `/cricket/match/${matchId}/commentary`,
    { revalidate: 15 }
  );
  return body.data;
}

/** Playing XI and bench, one entry per team. */
export async function getSquads(matchId: number | string): Promise<CricLiveSquad[]> {
  const body = await workerGet<Envelope<CricLiveSquad[]>>(`/cricket/match/${matchId}/squads`, {
    revalidate: 300,
  });
  return body.data ?? [];
}

/** Key moments — boundaries, wickets, milestones. */
export async function getHighlights(matchId: number | string): Promise<CricLiveHighlight[]> {
  const body = await workerGet<Envelope<{ highlights: CricLiveHighlight[]; total: number }>>(
    `/cricket/match/${matchId}/highlights`,
    { revalidate: 60 }
  );
  return body.data?.highlights ?? [];
}

// ---------------------------------------------------------------------------
// Adapters onto our own vocabulary (@crex/shared)
// ---------------------------------------------------------------------------

/**
 * CricLive's `state` is free text. Values observed across live/recent/upcoming:
 * "In Progress", "Toss", "Complete", "Preview", "Upcoming" — plus the usual
 * mid-match ones ("Innings Break", "Stumps", "Rain Delay"). Collapse onto ours.
 *
 * "Toss" counts as LIVE: the toss has happened and coverage is underway, which
 * is where a viewer expects to find it.
 */
export function toMatchStatus(m: CricLiveMatch): 'LIVE' | 'UPCOMING' | 'COMPLETED' {
  const state = (m.state ?? '').toLowerCase();

  if (state.includes('complete') || state.includes('abandon') || state.includes('cancel')) {
    return 'COMPLETED';
  }
  if (state.includes('preview') || state.includes('upcoming') || state.includes('scheduled')) {
    return 'UPCOMING';
  }
  return state ? 'LIVE' : 'UPCOMING';
}

/**
 * Observed formats: "TEST", "ODI", "T20", "HUN" (The Hundred). Our schema has
 * only three, so HUN — a 100-ball game — folds into T20 rather than silently
 * falling through to the ODI default.
 */
export function toMatchFormat(m: CricLiveMatch): 'TEST' | 'ODI' | 'T20' {
  const f = (m.format ?? '').toUpperCase();
  if (f.includes('TEST')) return 'TEST';
  if (f.includes('T20') || f.includes('T10') || f.includes('HUN')) return 'T20';
  return 'ODI';
}

/**
 * Innings totals for one side, newest last. CricLive gives a pre-formatted
 * `score` string too — prefer that for display, this for computation.
 */
export function teamInnings(team: CricLiveTeam) {
  return (team.innings ?? []).map((i) => ({
    runs: i.runs,
    wickets: i.wickets,
    overs: i.overs,
    target: i.target,
  }));
}
