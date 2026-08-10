// CricLive provider (cricketliveapi.com).
//
// Calls our Cloudflare Worker rather than CricLive directly, so:
//   - the API token lives in exactly one place (the Worker's secret)
//   - the backend and the browser share one edge cache, so the 5-minute sync
//     cron and a live viewer hitting the same endpoint cost one upstream call
//   - the backend needs no cricket credentials at all
//
// Upstream vocabulary is snake_case with `first_team`/`second_team` and
// pre-formatted score strings. Everything here normalizes into the CricApi*
// shapes in ./types, which is the app's lingua franca.
import type {
  CricketProvider,
  CricApiMatch,
  CricApiScorecardResponse,
  CricApiSeries,
  CricApiInningsCard,
} from './types';

const WORKER_URL = () => (process.env.CRICKET_WORKER_URL ?? '').replace(/\/$/, '');

/** The Worker is the only credential we need — it holds the CricLive token. */
export const isConfigured = () => Boolean(WORKER_URL());

// ---------------------------------------------------------------------------
// Upstream shapes (only the fields we consume)
// ---------------------------------------------------------------------------

interface CricLiveInnings {
  innings_id: number;
  runs: number;
  wickets: number;
  overs: number;
  target: number | null;
}

interface CricLiveTeam {
  id: number;
  name: string; // short, e.g. "AFG"
  full_name: string;
  score: string; // "299/8 (46.6 ov)"
  innings: CricLiveInnings[];
  team_image_url: string;
}

interface CricLiveMatch {
  match_id: number;
  series_id: number;
  series_name: string;
  match_desc: string;
  title: string;
  format: string; // ODI | T20 | TEST | HUN
  match_type: string;
  date: string; // "Aug 07, 09:45 GMT" — no year
  end_date: string;
  venue: string;
  status_detail: string;
  short_status: string;
  state: string; // In Progress | Toss | Complete | Preview | Upcoming
  slug: string;
  first_team: CricLiveTeam;
  second_team: CricLiveTeam;
  status: string;
}

interface CricLiveSeriesEntry {
  id: number;
  name: string;
  start_date: string; // "2024-02-15"
  end_date: string;
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

async function get<T>(path: string): Promise<T> {
  const base = WORKER_URL();
  if (!base) throw new Error('CRICKET_WORKER_URL is not configured');

  const res = await fetch(`${base}${path}`, { headers: { Accept: 'application/json' } });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    // 503 is the Worker telling us CRICKET_API_TOKEN is unset; 502 with a 401
    // behind it means the token expired or the subscription lapsed. Both only
    // affect the subscription-gated routes.
    throw new Error(`CricLive ${path} -> ${res.status} ${body.slice(0, 200)}`);
  }

  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Date parsing
// ---------------------------------------------------------------------------

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * CricLive sends "Aug 07, 09:45 GMT" — no year. `new Date()` on that yields
 * 2001 (V8's default for a year-less string), which would put every match 25
 * years in the past and break both sorting and the "started long ago, so it
 * must be over" heuristic in mapStatus.
 *
 * So parse explicitly and infer the year as whichever candidate sits closest to
 * now. That keeps December/January fixtures on the right side of the boundary.
 */
export function parseCricLiveDate(raw: string | undefined, now = new Date()): Date | undefined {
  if (!raw) return undefined;

  // If a 4-digit year is present, the string is unambiguous — let Date have it.
  if (/\b\d{4}\b/.test(raw)) {
    const direct = new Date(raw);
    return Number.isNaN(direct.getTime()) ? undefined : direct;
  }

  const m = /^\s*([A-Za-z]{3})[a-z]*\s+(\d{1,2})\s*,\s*(\d{1,2}):(\d{2})/.exec(raw);
  if (!m) return undefined;

  const month = MONTHS[m[1].toLowerCase()];
  if (month === undefined) return undefined;

  const [day, hour, minute] = [Number(m[2]), Number(m[3]), Number(m[4])];

  // Times are quoted in GMT, so build in UTC.
  const candidates = [-1, 0, 1].map((offset) =>
    new Date(Date.UTC(now.getUTCFullYear() + offset, month, day, hour, minute))
  );

  return candidates.reduce((best, c) =>
    Math.abs(c.getTime() - now.getTime()) < Math.abs(best.getTime() - now.getTime()) ? c : best
  );
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/** CricLive's `state` is the reliable signal; the status text is free-form. */
function stateFlags(state: string): { started: boolean; ended: boolean } {
  const s = (state ?? '').toLowerCase();

  if (s.includes('complete') || s.includes('abandon') || s.includes('cancel')) {
    return { started: true, ended: true };
  }
  if (s.includes('preview') || s.includes('upcoming') || s.includes('scheduled')) {
    return { started: false, ended: false };
  }
  // In Progress, Toss, Innings Break, Stumps, Rain Delay, …
  return { started: Boolean(s), ended: false };
}

/**
 * Compose a status string that mapStatus() reads correctly. Two CricLive quirks
 * make the naive passthrough wrong:
 *
 *  - Pre-match text is "Match starts at Aug 08, 23:00 GMT", which matches none
 *    of mapStatus()'s pre-match keywords. It would fall through to the
 *    scheduled-time fallback and mark any *delayed* start as COMPLETED, so say
 *    "not started" explicitly.
 *  - Toss text is "Ireland won the toss and elected to bowling". mapStatus()
 *    treats "won" as proof a match finished, which would complete a match that
 *    hasn't bowled a ball — so strip the toss clause while it's still live.
 */
function statusText(m: CricLiveMatch, started: boolean, ended: boolean): string {
  const detail = (m.status_detail || m.short_status || m.state || '').trim();

  if (ended) return detail;
  if (!started) return detail ? `Not started — ${detail}` : 'Not started';

  const cleaned = detail.replace(/\b[\w\s]*?won the toss[^.]*/gi, '').trim();
  return cleaned || m.state || '';
}

/**
 * Start time. CricLive's `date` field can disagree with its own status text —
 * we've seen `date: "Aug 07, 23:00 GMT"` on a match whose detail reads "Match
 * starts at Aug 08, 23:00 GMT". The detail is the more reliable of the two, so
 * prefer the timestamp embedded there and fall back to `date`.
 */
function startTime(m: CricLiveMatch): Date | undefined {
  const announced = /match starts at\s+(.+?)\s*$/i.exec(m.status_detail ?? '');
  return parseCricLiveDate(announced?.[1]) ?? parseCricLiveDate(m.date);
}

/** CricLive reports "HUN" for The Hundred; our schema has no such format. */
function matchType(format: string): string {
  const f = (format ?? '').toLowerCase();
  if (f.includes('hun')) return 't20'; // 100-ball game — nearest of our three
  return f;
}

/**
 * Innings from both sides, interleaved in playing order. Labels follow CricAPI's
 * "<SHORT> Inning <n>" convention because mapScorecard() parses the team short
 * name back out of it.
 */
function innings(m: CricLiveMatch): CricApiMatch['score'] {
  const sides = [m.first_team, m.second_team].filter(Boolean);
  const hundred = (m.format ?? '').toLowerCase().includes('hun');

  const rows = sides.flatMap((team) =>
    (team.innings ?? []).map((i) => ({
      r: i.runs,
      w: i.wickets,
      o: hundred ? ballsToOvers(i.overs) : i.overs,
      inning: `${team.name} Inning ${i.innings_id}`,
      _order: i.innings_id,
    }))
  );

  return rows.sort((a, b) => a._order - b._order).map(({ _order, ...rest }) => rest);
}

/**
 * The Hundred is a 100-ball format and CricLive reports its `overs` field in
 * balls — a completed innings comes through as 100, not 16.4. Left as-is the UI
 * would render "100 ov", so convert to standard overs.balls notation.
 */
function ballsToOvers(balls: number): number {
  if (!balls) return 0;
  return Math.floor(balls / 6) + (balls % 6) / 10;
}

function toMatch(m: CricLiveMatch): CricApiMatch {
  const { started, ended } = stateFlags(m.state);
  const start = startTime(m);

  return {
    id: String(m.match_id),
    name: m.title || `${m.first_team?.full_name} vs ${m.second_team?.full_name}`,
    matchType: matchType(m.format),
    status: statusText(m, started, ended),
    venue: m.venue || 'TBD',
    date: start?.toISOString().slice(0, 10),
    dateTimeGMT: start?.toISOString(),
    teams: [m.first_team?.full_name, m.second_team?.full_name].filter(Boolean),
    teamInfo: [m.first_team, m.second_team].filter(Boolean).map((t) => ({
      name: t.full_name,
      shortname: t.name,
      img: t.team_image_url,
    })),
    score: innings(m),
    series_id: String(m.series_id),
    series_name: m.series_name,
    matchStarted: started,
    matchEnded: ended,
    slug: m.slug,
  };
}

// ---------------------------------------------------------------------------
// Provider surface
// ---------------------------------------------------------------------------

interface ListEnvelope {
  success: boolean;
  count: number;
  data: CricLiveMatch[];
}

/**
 * Live + recently completed matches, per the provider contract.
 *
 * CricLive splits these across two endpoints where CricAPI bundled them, so both
 * are fetched and merged. Recent matters: the sync job is what writes final
 * results to the DB, and a match that finishes between two 30-minute cron ticks
 * would drop off /matches/live before ever being recorded as COMPLETED.
 *
 * Both are public, both cached at the edge (15s live, 5m recent).
 */
export async function fetchLiveMatches(): Promise<CricApiMatch[]> {
  const [live, recent] = await Promise.all([
    get<ListEnvelope>('/cricket/matches/live'),
    // A recent-list failure must not sink the live scores.
    get<ListEnvelope>('/cricket/matches/recent').catch((err) => {
      console.warn(`[criclive] recent matches unavailable: ${(err as Error).message}`);
      return { data: [] } as unknown as ListEnvelope;
    }),
  ]);

  // Live wins on overlap — it carries the fresher score.
  const byId = new Map<number, CricLiveMatch>();
  for (const m of [...(recent.data ?? []), ...(live.data ?? [])]) byId.set(m.match_id, m);

  return [...byId.values()].map(toMatch);
}

/** Scheduled matches. Public endpoint. */
export async function fetchFixtures(): Promise<CricApiMatch[]> {
  const body = await get<ListEnvelope>('/cricket/matches/upcoming');
  return (body.data ?? []).map(toMatch);
}

/**
 * CricLive has no single-match info endpoint, so scan the three match lists.
 * They're all cached at the edge, so this is cheap.
 */
export async function fetchMatchInfo(id: string): Promise<CricApiMatch> {
  const lists = await Promise.all(
    ['live', 'upcoming', 'recent'].map((kind) =>
      get<ListEnvelope>(`/cricket/matches/${kind}`).catch(() => ({ data: [] } as unknown as ListEnvelope))
    )
  );

  const found = lists.flatMap((l) => l.data ?? []).find((m) => String(m.match_id) === String(id));
  if (!found) throw new Error(`CricLive: match ${id} not in live/upcoming/recent`);

  return toMatch(found);
}

/** Current series, flattened out of CricLive's month grouping. */
export async function fetchSeriesList(): Promise<CricApiSeries[]> {
  const body = await get<{
    data: { months?: Array<{ series?: CricLiveSeriesEntry[] }> };
  }>('/cricket/series/international');

  const months = body.data?.months ?? [];
  return months.flatMap((month) =>
    (month.series ?? []).map((s) => ({
      id: String(s.id),
      name: s.name,
      startDate: s.start_date,
      endDate: s.end_date,
    }))
  );
}

// Scorecard payload, as returned by /cricket/match/{id}/scorecard.
interface CricLiveScorecardInnings {
  bat_team: string;
  bat_team_short: string;
  bowl_team: string;
  score: string; // "303/7 (50 ov)"
  innings_id: number;
  batsmen: Array<{
    name: string;
    runs: number;
    balls: number;
    fours: number;
    sixes: number;
    strike_rate: number;
    out_desc: string; // "c Hollman b Brookes" | "not out"
    wicket_code: string;
  }>;
  bowlers: Array<{
    name: string;
    overs: number;
    maidens: number;
    runs: number;
    wickets: number;
    economy: number;
  }>;
  extras: string; // display string: "Extras: 8 (b 0, lb 2, w 5, nb 1, p 0)"
  extras_detail: {
    total: number;
    byes: number;
    leg_byes: number;
    wides: number;
    no_balls: number;
    penalty: number;
  };
}

/**
 * Per-innings batting and bowling lines.
 *
 * Subscription-gated route: if the Worker has no token it answers 503, and a
 * rejected token surfaces as 502. Callers treat an empty `scorecard` as "keep
 * what's stored", so either case degrades to innings totals instead of breaking.
 *
 * Only `.scorecard` is read downstream (see ensureScorecardLines), so we return
 * a minimal base rather than resolving the full match — that saves the three
 * list requests fetchMatchInfo would otherwise make on every call.
 */
export async function fetchMatchScorecard(id: string): Promise<CricApiScorecardResponse> {
  const base = { id, name: '', status: '' } as CricApiMatch;

  try {
    const body = await get<{ data?: { innings?: CricLiveScorecardInnings[] } }>(
      `/cricket/match/${id}/scorecard`
    );
    return { ...base, scorecard: normalizeScorecard(body.data?.innings ?? []) };
  } catch (err) {
    console.warn(`[criclive] scorecard unavailable for ${id}: ${(err as Error).message}`);
    return { ...base, scorecard: [] };
  }
}

/**
 * Map CricLive innings onto CricApiInningsCard[].
 *
 * The innings label is the load-bearing part: mergeScorecardDetail() matches
 * these cards against the stored innings by that string, and the stored ones are
 * written as "<SHORT> Inning <n>" by innings() above. So the label must be built
 * the same way or the batting/bowling lines silently fail to attach.
 *
 * Position is used for <n> rather than `innings_id`, because CricLive reports
 * innings_id as 0 for *every* innings in this payload — both innings of a
 * two-innings match come through as 0. Position is safe here because innings
 * alternate teams, so index+1 reproduces the real innings number as long as the
 * payload starts at the first innings, which is what it does.
 *
 * KNOWN LIMIT: CricLive caps this payload at two innings. A completed Test with
 * four (verified on WI v PAK, match 152507: the match list reports innings 1-4,
 * the scorecard returns only 1 and 2) therefore gets batting/bowling lines for
 * the first two innings only. The rest keep their stored totals — under-filled
 * rather than wrong.
 */
function normalizeScorecard(list: CricLiveScorecardInnings[]): CricApiInningsCard[] {
  return list.map((e, idx) => ({
    inning: `${e.bat_team_short ?? e.bat_team ?? ''} Inning ${idx + 1}`.trim(),

    batting: (e.batsmen ?? []).map((b) => ({
      // CricLive sends no player id on scorecard rows, so mapBatting() falls
      // back to the name as the key.
      batsman: { name: b.name },
      'dismissal-text': b.out_desc ?? '',
      r: num(b.runs),
      b: num(b.balls),
      '4s': num(b.fours),
      '6s': num(b.sixes),
      sr: num(b.strike_rate),
    })),

    bowling: (e.bowlers ?? []).map((b) => ({
      bowler: { name: b.name },
      o: num(b.overs),
      m: num(b.maidens),
      r: num(b.runs),
      w: num(b.wickets),
      eco: num(b.economy),
    })),

    // extras_detail is the numeric breakdown; `extras` is a display string that
    // extrasTotal() cannot read.
    extras: e.extras_detail
      ? {
          total: num(e.extras_detail.total),
          b: num(e.extras_detail.byes),
          lb: num(e.extras_detail.leg_byes),
          w: num(e.extras_detail.wides),
          nb: num(e.extras_detail.no_balls),
          p: num(e.extras_detail.penalty),
        }
      : undefined,
  }));
}

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v) || 0);

// Satisfy the contract explicitly so a drift in either side fails at compile time.
export const provider: CricketProvider = {
  isConfigured,
  fetchLiveMatches,
  fetchMatchInfo,
  fetchMatchScorecard,
  fetchFixtures,
  fetchSeriesList,
};
