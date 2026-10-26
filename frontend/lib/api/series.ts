// Series summaries. `seriesFromMatches` groups the live feed (a window, so its
// counts and dates are partial); `getApiSeriesSchedule` reads the whole
// competition from /series/matches and is the source for any total shown.
import type { Match, MatchFormat, MatchStatus, SeriesSummary, Team } from '@/types';
import { isUnofficialTest } from '../matchType';
import type { FetchOpts } from './client';
import { knockoutStage, scheduleFormat, scheduleStatus } from './codes';
import { cleanKey, resolveKeys, toTeam, venueOf } from './names';
import { getApiSeriesMatches, scheduleRows, scheduledMatchId, type ApiSeriesMatch } from './schedule';

/**
 * "Live" means the competition is under way: something played and something to
 * come, even on a rest day. Upcoming is one not started; completed has nothing left.
 */
function seriesStatus(matches: Array<{ status: MatchStatus }>): MatchStatus {
  if (matches.some((m) => m.status === 'LIVE')) return 'LIVE';

  const toCome = matches.some((m) => m.status === 'UPCOMING');
  if (!toCome) return 'COMPLETED';

  return matches.some((m) => m.status === 'COMPLETED') ? 'LIVE' : 'UPCOMING';
}

/** The most common format — one label for a tour of Tests then ODIs. */
function dominantFormat(matches: Array<{ format: MatchFormat }>): MatchFormat {
  const tally = new Map<MatchFormat, number>();
  for (const m of matches) tally.set(m.format, (tally.get(m.format) ?? 0) + 1);
  return [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/** Each format a list contains, in the order they first appear. */
function formatsIn(matches: Array<{ format: MatchFormat; startTime: string }>): MatchFormat[] {
  const ordered = [...matches].sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime));
  return [...new Set(ordered.map((m) => m.format))];
}

/** Multi-day cricket between sides that don't play Tests: the series chip says "Multi-day". */
const unofficialTestsIn = (matches: Array<Parameters<typeof isUnofficialTest>[0]>): boolean =>
  matches.some((m) => m.format === 'TEST') && matches.filter((m) => m.format === 'TEST').every(isUnofficialTest);

/** How many are finished — the other half of "12 of 34". */
const playedCount = (matches: Array<{ status: MatchStatus }>): number =>
  matches.filter((m) => m.status === 'COMPLETED').length;

/** Group the feed into series, live first, then upcoming, each by soonest start. */
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
      formats: formatsIn(list),
      unofficialTests: unofficialTestsIn(list),
      status: seriesStatus(list),
      matchCount: list.length,
      startDate: new Date(Math.min(...times)).toISOString(),
      endDate: new Date(Math.max(...times)).toISOString(),
    });
  }

  const rank = { LIVE: 0, UPCOMING: 1, COMPLETED: 2 } as const;
  return summaries.sort(
    (a, b) => rank[a.status] - rank[b.status] || +new Date(a.startDate) - +new Date(b.startDate)
  );
}

/** Scheduled days per format: a series ends on its last match's start plus these, as the upstream's header says. */
const FORMAT_DAYS: Record<MatchFormat, number> = { TEST: 5, ODI: 1, T20: 1, T10: 1 };

/** One row of a series' schedule, with keys resolved to names. */
export interface SeriesScheduleMatch {
  /** What /matches/{id} takes: the match key, or the `fx-` preview id before the upstream allocates one. */
  id: string;
  /** The real match key, or null — the flag for anything needing the match's own endpoints. */
  matchKey: string | null;
  /** Stable list key: the match key, or its slot in the schedule. */
  key: string;
  /** "1", "Final", or null when the upstream has not numbered it. */
  matchNo: string | null;
  format: MatchFormat;
  status: MatchStatus;
  startTime: string;
  venue: string;
  venueId: string | null;
  result: string | null;
  homeTeam: Team;
  awayTeam: Team;
}

export interface SeriesSchedule extends SeriesSummary {
  /** Every match in the series, earliest first. */
  matches: SeriesScheduleMatch[];
  playedCount: number;
}

function lastDay(match: SeriesScheduleMatch): string {
  const days = FORMAT_DAYS[match.format] - 1;
  if (!days) return match.startTime;
  return new Date(+new Date(match.startTime) + days * 86_400_000).toISOString();
}

/**
 * A series' full schedule, earliest first. `fallback` (the feed-derived summary)
 * supplies the name and format when the mapping has none. Null when the upstream lists
 * no matches for the key.
 */
export async function getApiSeriesSchedule(
  seriesKey: string,
  opts: FetchOpts & { fallback?: SeriesSummary } = {}
): Promise<SeriesSchedule | null> {
  const id = cleanKey(seriesKey);
  const raw = await getApiSeriesMatches(id, opts);

  // Rows need only a start time: unallocated fixtures have no `mf`, and requiring
  // one undercounts a league by its whole playoff stage.
  const rows = scheduleRows(raw)
    .filter((m): m is ApiSeriesMatch & { t: number } => Boolean(m?.t))
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
    matchNo: m.mn?.startsWith('^') ? knockoutStage(m.mn) : m.mn || null,
    format: scheduleFormat(m.ft, opts.fallback?.format),
    status: scheduleStatus(m.s),
    startTime: new Date(m.t).toISOString(),
    ...venueOf(m.vf, names),
    result: m.r || null,
    homeTeam: toTeam(m.t1f ?? '', names),
    awayTeam: toTeam(m.t2f ?? '', names),
  }));

  return {
    id,
    name: names.s.get(id)?.n ?? opts.fallback?.name ?? 'Cricket',
    format: dominantFormat(matches),
    formats: formatsIn(matches),
    unofficialTests: unofficialTestsIn(matches),
    status: seriesStatus(matches),
    matchCount: matches.length,
    playedCount: playedCount(matches),
    startDate: matches[0].startTime,
    endDate: lastDay(matches[matches.length - 1]),
    matches,
  };
}

/**
 * A schedule built from the feed alone — only the matches in its window. The
 * fallback for when /series/matches is unreachable: a short schedule beats a 404.
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
 * Per-match statuses from the feed where it has them (the schedule's lag up to
 * five minutes), then the series' status and count re-derived from the whole list
 * (the feed alone misses matches outside its window).
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

/** Feed-derived summaries with their real spans, totals and statuses; a failed schedule keeps the feed's. */
export async function withSeriesSchedules(
  summaries: SeriesSummary[],
  feed: Match[],
  opts: FetchOpts = {}
): Promise<SeriesSummary[]> {
  const schedules = await Promise.all(
    summaries.map((s) =>
      getApiSeriesSchedule(s.id, { ...opts, fallback: s }).catch(() => null)
    )
  );

  return summaries.map((s, i) => {
    const full = schedules[i];
    if (!full) return s;
    const { matches: _matches, ...summary } = withFeedStatuses(full, feed);
    return summary;
  });
}
