// Cricbuzz (via RapidAPI) provider.
//
// Cricbuzz's responses are structurally different from CricAPI's — nested match
// listings, lowercase keys on some endpoints, epoch-millis dates, string-typed
// numbers. Every function here translates that into the shared normalized shape
// (CricApiMatch / CricApiScorecardResponse / CricApiSeries) so the rest of the
// app is identical regardless of which provider is active.
import { incrementApiCall } from '../../lib/usage';
import type {
  CricApiInningsCard,
  CricApiMatch,
  CricApiScorecardResponse,
  CricApiSeries,
  CricketProvider,
} from './types';

const HOST = process.env.RAPIDAPI_HOST ?? 'cricbuzz-cricket.p.rapidapi.com';
const apiKey = () => process.env.RAPIDAPI_KEY ?? '';

export const isConfigured: CricketProvider['isConfigured'] = () => Boolean(apiKey());

async function call<T>(path: string): Promise<T> {
  const key = apiKey();
  if (!key) throw new Error('RAPIDAPI_KEY is not configured');

  // Count every upstream call toward the daily quota.
  await incrementApiCall();

  const res = await fetch(`https://${HOST}/${path}`, {
    headers: {
      'x-rapidapi-key': key,
      'x-rapidapi-host': HOST,
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Cricbuzz ${path} HTTP ${res.status}`);
  return (await res.json()) as T;
}

// --- Raw Cricbuzz shapes (only the fields we consume) -----------------------

interface CbTeam {
  teamId?: number;
  teamName?: string;
  teamSName?: string;
  imageId?: number;
}
interface CbVenue {
  ground?: string;
  city?: string;
}
interface CbMatchInfo {
  matchId: number;
  seriesId?: number;
  matchDesc?: string;
  matchFormat?: string;
  startDate?: string; // epoch millis, as string
  state?: string;
  status?: string;
  team1?: CbTeam;
  team2?: CbTeam;
  venueInfo?: CbVenue;
}
interface CbInnings {
  inningsId?: number;
  runs?: number;
  wickets?: number;
  overs?: number;
}
interface CbMatchScore {
  team1Score?: Record<string, CbInnings>;
  team2Score?: Record<string, CbInnings>;
}
interface CbMatch {
  matchInfo: CbMatchInfo;
  matchScore?: CbMatchScore;
}
interface CbMatchesResponse {
  typeMatches?: Array<{
    seriesMatches?: Array<{
      seriesAdWrapper?: { matches?: CbMatch[] };
    }>;
  }>;
}

// --- Translation helpers ----------------------------------------------------

function epochToIso(ms?: string): string | undefined {
  if (!ms) return undefined;
  const n = Number(ms);
  if (Number.isNaN(n)) return undefined;
  return new Date(n).toISOString();
}

// Cricbuzz splits each team's innings into `inngs1`, `inngs2`… objects. Flatten
// both teams into one chronological score array, labelled the same way the
// scorecard endpoint labels innings ("<Full Team Name> Inning <n>") so that
// mergeScorecardDetail can match them by label.
function mapScore(score: CbMatchScore | undefined, t1?: string, t2?: string) {
  const rows: Array<{ r: number; w: number; o: number; inning: string; _id: number }> = [];
  const add = (side: Record<string, CbInnings> | undefined, teamName?: string) => {
    if (!side || !teamName) return;
    for (const inn of Object.values(side)) {
      if (!inn || typeof inn !== 'object') continue;
      const id = inn.inningsId ?? 0;
      rows.push({
        r: inn.runs ?? 0,
        w: inn.wickets ?? 0,
        o: inn.overs ?? 0,
        inning: `${teamName} Inning ${id}`,
        _id: id,
      });
    }
  };
  add(score?.team1Score, t1);
  add(score?.team2Score, t2);
  return rows.sort((a, b) => a._id - b._id).map(({ _id, ...rest }) => rest);
}

function mapMatchInfo(mi: CbMatchInfo, score?: CbMatchScore): CricApiMatch {
  const t1 = mi.team1?.teamName;
  const t2 = mi.team2?.teamName;
  const iso = epochToIso(mi.startDate);
  const venue = [mi.venueInfo?.ground, mi.venueInfo?.city].filter(Boolean).join(', ');
  const state = (mi.state ?? '').toLowerCase();

  return {
    id: String(mi.matchId),
    name: [t1, t2].filter(Boolean).join(' vs ') + (mi.matchDesc ? `, ${mi.matchDesc}` : ''),
    matchType: mi.matchFormat, // "TEST" | "ODI" | "T20" | … -> mapFormat handles it
    status: mi.status ?? '',
    venue: venue || undefined,
    date: iso ? iso.slice(0, 10) : undefined,
    dateTimeGMT: iso,
    teams: [t1, t2].filter(Boolean) as string[],
    teamInfo: [mi.team1, mi.team2]
      .filter((t): t is CbTeam => Boolean(t?.teamName))
      .map((t) => ({ name: t.teamName as string, shortname: t.teamSName })),
    score: mapScore(score, t1, t2),
    series_id: mi.seriesId != null ? String(mi.seriesId) : undefined,
    // Cricbuzz has no boolean flags; derive them from `state`.
    matchStarted: state !== '' && state !== 'preview' && state !== 'upcoming',
    matchEnded: state === 'complete',
  };
}

function flattenMatches(data: CbMatchesResponse): CricApiMatch[] {
  const out: CricApiMatch[] = [];
  for (const tm of data.typeMatches ?? []) {
    for (const sm of tm.seriesMatches ?? []) {
      const matches = sm.seriesAdWrapper?.matches;
      if (!matches) continue; // skip ad slots
      for (const m of matches) out.push(mapMatchInfo(m.matchInfo, m.matchScore));
    }
  }
  return out;
}

// --- Endpoints --------------------------------------------------------------

/**
 * Currently live + recent matches — mirrors CricAPI's `currentMatches` breadth.
 * Cricbuzz splits these across two endpoints, so we fetch both and de-dupe by
 * matchId. That is two quota units per call (CricAPI needed one); acceptable
 * because live coverage is core to the product.
 */
export const fetchLiveMatches: CricketProvider['fetchLiveMatches'] = async () => {
  const [live, recent] = await Promise.all([
    call<CbMatchesResponse>('matches/v1/live').catch(() => ({} as CbMatchesResponse)),
    call<CbMatchesResponse>('matches/v1/recent').catch(() => ({} as CbMatchesResponse)),
  ]);
  const byId = new Map<string, CricApiMatch>();
  for (const m of [...flattenMatches(live), ...flattenMatches(recent)]) byId.set(m.id, m);
  return [...byId.values()];
};

/** Full match detail (metadata only; Cricbuzz `mcenter` has no score block). */
export const fetchMatchInfo: CricketProvider['fetchMatchInfo'] = async (id) => {
  // mcenter returns lowercase keys — remap the ones we expose.
  const d = await call<Record<string, any>>(`mcenter/v1/${id}`);
  const t1 = d.team1?.teamname as string | undefined;
  const t2 = d.team2?.teamname as string | undefined;
  const iso = epochToIso(d.startdate);
  const venue = [d.venueinfo?.ground, d.venueinfo?.city].filter(Boolean).join(', ');
  const state = (d.state ?? '').toLowerCase();
  return {
    id: String(d.matchid ?? id),
    name: [t1, t2].filter(Boolean).join(' vs ') + (d.matchdesc ? `, ${d.matchdesc}` : ''),
    matchType: d.matchformat,
    status: d.status ?? '',
    venue: venue || undefined,
    date: iso ? iso.slice(0, 10) : undefined,
    dateTimeGMT: iso,
    teams: [t1, t2].filter(Boolean) as string[],
    teamInfo: [d.team1, d.team2]
      .filter((t: any) => Boolean(t?.teamname))
      .map((t: any) => ({ name: t.teamname, shortname: t.teamsname })),
    series_id: d.seriesid != null ? String(d.seriesid) : undefined,
    matchStarted: state !== '' && state !== 'preview' && state !== 'upcoming',
    matchEnded: state === 'complete',
  };
};

/** Per-innings batting/bowling scorecard (`hscard`). */
export const fetchMatchScorecard: CricketProvider['fetchMatchScorecard'] = async (id) => {
  const d = await call<{ scorecard?: any[] }>(`mcenter/v1/${id}/hscard`);
  const cards: CricApiInningsCard[] = (d.scorecard ?? []).map((inn) => ({
    inning: `${inn.batteamname} Inning ${inn.inningsid}`,
    batting: (inn.batsman ?? []).map((b: any) => ({
      batsman: { id: String(b.id), name: b.name },
      'dismissal-text': b.outdec ?? '',
      r: b.runs ?? 0,
      b: b.balls ?? 0,
      '4s': b.fours ?? 0,
      '6s': b.sixes ?? 0,
      sr: Number(b.strkrate) || 0,
    })),
    bowling: (inn.bowler ?? []).map((b: any) => ({
      bowler: { id: String(b.id), name: b.name },
      o: Number(b.overs) || 0,
      m: b.maidens ?? 0,
      r: b.runs ?? 0,
      w: b.wickets ?? 0,
      eco: Number(b.economy) || 0,
    })),
    // extras already carries a `total`; extrasTotal() prefers it.
    extras: inn.extras,
  }));
  const resp: CricApiScorecardResponse = { id: String(id), name: '', status: '', scorecard: cards };
  return resp;
};

/** Upcoming / scheduled matches. */
export const fetchFixtures: CricketProvider['fetchFixtures'] = async () => {
  const data = await call<CbMatchesResponse>('matches/v1/upcoming');
  return flattenMatches(data);
};

/** Current international series list. */
export const fetchSeriesList: CricketProvider['fetchSeriesList'] = async () => {
  const data = await call<{ seriesMapProto?: Array<{ series?: any[] }> }>('series/v1/international');
  const out: CricApiSeries[] = [];
  for (const node of data.seriesMapProto ?? []) {
    for (const s of node.series ?? []) {
      out.push({
        id: String(s.id),
        name: s.name,
        startDate: epochToIso(s.startDt)?.slice(0, 10),
        endDate: epochToIso(s.endDt)?.slice(0, 10),
      });
    }
  }
  return out;
};
