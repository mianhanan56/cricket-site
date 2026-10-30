// A team page from four sources: /mapping (names, colours), /team/matches (its
// scheduled matches), the fixtures corpus (what it has played) and /rankings.
// Squads are named per series, so the side's nearest competition is found first.
import type { HeadToHeadMatch, Match, RankingFormat, RankingGender, TeamColors, TeamProfile, TeamRankingPosition } from '@/types';
import { attributeResult } from './attribution';
import { apiGet, type FetchOpts } from './client';
import { scheduleFormat, scheduleStatus } from './codes';
import { getApiFixtureRange, type Fixture } from './fixtures';
import { cleanKey, resolveKeys, seriesRef, toTeam, type ApiMapEntry } from './names';
import { getApiTeamRankings, type ApiTeamRankingsResponse } from './rankings';
import { parseScheduledMatchId, scheduledMatchId, type ApiSeriesMatch } from './schedule';
import { getApiTeamSquad } from './squads';

/** A /series/matches row without the ground, match number and result. */
type ApiTeamMatch = Pick<ApiSeriesMatch, 'matchKey' | 'id' | 'team1Key' | 'team2Key' | 'startTime' | 'status' | 'format'>;

/** Grouped by series key. */
type ApiTeamMatchesResponse = Record<string, ApiTeamMatch[]>;

/** A team's scheduled matches, grouped by series. */
export function getApiTeamMatches(
  teamKey: string,
  opts: FetchOpts = {}
): Promise<ApiTeamMatchesResponse> {
  return apiGet<ApiTeamMatchesResponse>(
    `/team/matches?key=${encodeURIComponent(cleanKey(teamKey))}`,
    { revalidate: 300, ...opts }
  );
}

/** "0-#8F65E6" → "#8F65E6". The leading digit is a mode flag for the upstream's own gradients. */
function parseTeamColor(raw: string | undefined): string | null {
  const hex = /#[0-9a-f]{3,8}/i.exec(raw ?? '')?.[0];
  return hex ?? null;
}

function teamColors(entry: ApiMapEntry | undefined): TeamColors {
  return {
    primary: parseTeamColor(entry?.primaryColor),
    secondary: parseTeamColor(entry?.secondaryColor),
  };
}

const RANKING_FORMATS: Array<['test' | 'odi' | 't20', RankingFormat]> = [
  ['test', 'TEST'],
  ['odi', 'ODI'],
  ['t20', 'T20I'],
];

/** The side's place in every format's team ranking, both genders. */
async function teamRankingPositions(
  teamKey: string,
  opts: FetchOpts = {}
): Promise<TeamRankingPosition[]> {
  const genders: RankingGender[] = ['MEN', 'WOMEN'];
  const lists = await Promise.all([
    getApiTeamRankings('men', opts).catch(() => ({}) as ApiTeamRankingsResponse),
    getApiTeamRankings('women', opts).catch(() => ({}) as ApiTeamRankingsResponse),
  ]);

  const out: TeamRankingPosition[] = [];
  lists.forEach((byFormat, i) => {
    for (const [wire, format] of RANKING_FORMATS) {
      const rows = byFormat[wire] ?? [];
      // Rows arrive ordered by rating with no `position` field, so position is the index.
      const at = rows.findIndex((r) => cleanKey(r.teamKey) === teamKey);
      if (at < 0) continue;
      out.push({ format, gender: genders[i], position: at + 1, rating: rows[at].rating ?? 0 });
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
    sides: [
      { id: m.homeTeam.id, shortName: m.homeTeam.shortName, name: m.homeTeam.name },
      { id: m.awayTeam.id, shortName: m.awayTeam.shortName, name: m.awayTeam.name },
    ],
  };
}

const byNewest = (a: { startTime: string }, b: { startTime: string }) =>
  +new Date(b.startTime) - +new Date(a.startTime);

const bySoonest = (a: { startTime: string }, b: { startTime: string }) =>
  +new Date(a.startTime) - +new Date(b.startTime);

/** Results a form strip shows — what the upstream shows, and what fits a row. */
const FORM_LENGTH = 5;

/**
 * Everything a team page renders, or null when the key names no side. Upcoming is
 * the union of /team/matches (only the side's current competition) and the corpus;
 * form comes from result sentences, and a result it can't attribute is left out.
 */
export async function getApiTeamProfile(
  teamKey: string,
  opts: FetchOpts = {}
): Promise<TeamProfile | null> {
  const key = cleanKey(teamKey);
  if (!key) return null;

  const [names, scheduled, corpus, rankings] = await Promise.all([
    resolveKeys({ t: [key] }, opts),
    getApiTeamMatches(key, opts).catch(() => ({} as ApiTeamMatchesResponse)),
    getApiFixtureRange(opts).catch(() => [] as Fixture[]),
    teamRankingPositions(key, opts),
  ]);

  const entry = names.t.get(key);
  // No name and no cricket is a 404; a named side between tours is still a page.
  const mine = corpus.filter((m) => m.homeTeam.id === key || m.awayTeam.id === key);
  if (!entry && !mine.length && !Object.keys(scheduled).length) return null;

  const team = toTeam(key, names);

  const scheduledRows = Object.entries(scheduled ?? {}).flatMap(([seriesKey, rows]) =>
    (rows ?? [])
      .filter((r) => r?.startTime && (r.status ?? 0) !== 2)
      .map((r) => ({ seriesKey: cleanKey(seriesKey), row: r }))
  );

  const rowNames = await resolveKeys(
    {
      t: scheduledRows.flatMap(({ row }) => [row.team1Key ?? '', row.team2Key ?? '']),
      s: scheduledRows.map(({ seriesKey }) => seriesKey),
    },
    opts
  );

  const fromEndpoint: Match[] = scheduledRows.map(({ seriesKey, row }) => ({
    id: cleanKey(row.matchKey) || scheduledMatchId(seriesKey, row.id),
    homeTeam: toTeam(row.team1Key ?? '', rowNames),
    awayTeam: toTeam(row.team2Key ?? '', rowNames),
    series: seriesRef(seriesKey, rowNames),
    format: scheduleFormat(row.format),
    status: scheduleStatus(row.status),
    // The upcoming rail shows no ground, so /team/matches doesn't send one.
    venue: '',
    venueId: null,
    startTime: new Date(row.startTime as number).toISOString(),
    result: null,
  }));

  // The same fixture can come from both sources, keyed by its match key in one and a preview
  // id in the other: a preview is dropped when a keyed match of the same shape exists, in
  // either order, and the keyed one is kept since it opens the full match centre.
  const pending = [...fromEndpoint, ...mine.filter((f) => f.status !== 'COMPLETED')].sort(bySoonest);
  const shape = (m: Match) => `${[m.homeTeam.id, m.awayTeam.id].sort().join('-')}-${m.startTime.slice(0, 10)}`;
  const keyedShapes = new Set(pending.filter((m) => !parseScheduledMatchId(m.id)).map(shape));
  const upcoming: Match[] = [];
  const seenUpcoming = new Set<string>();
  for (const m of pending) {
    const preview = Boolean(parseScheduledMatchId(m.id));
    if (preview && keyedShapes.has(shape(m))) continue;
    const dedupe = preview ? shape(m) : m.id;
    if (seenUpcoming.has(dedupe)) continue;
    seenUpcoming.add(dedupe);
    upcoming.push(m);
  }

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

  // The squad of the competition the side is in: its next match's series, else its last one's.
  const squadSeriesKey =
    upcoming.find((m) => m.series.id)?.series.id ?? [...mine].sort(byNewest)[0]?.series.id ?? null;

  const squad = squadSeriesKey
    ? await getApiTeamSquad(squadSeriesKey, key, opts).catch(() => [])
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
