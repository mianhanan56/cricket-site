// Matches outside the live feed's window, rebuilt from series schedule rows:
// aged-out results, and fixtures the upstream has not given a match key yet.
import type { Match } from '@/types';
import { apiGet, type FetchOpts } from './client';
import { scheduleBalls, scheduleFormat, scheduleStatus } from './codes';
import type { ApiMatchInfo } from './matchInfo';
import { cleanKey, resolveKeys, seriesRef, toTeam, venueOf } from './names';
import { scorecardFromRaw, type ApiScorecardBody } from './scorecard';

/** One match as /series/matches sends it, grouped under a date key ("2026/7/21"). */
export interface ApiSeriesMatch {
  /** Match key — empty until the upstream allocates one, a day or two before the match. */
  mf: string;
  /** The upstream's row id, on every row; addresses an unallocated fixture (see `scheduledMatchId`). */
  id?: number;
  /** Team 1 / team 2 keys. */
  t1f?: string;
  t2f?: string;
  /** Venue key. */
  vf?: string;
  /** Match number within the series, "1" or "Final". */
  mn?: string;
  /** Start time, epoch ms. */
  t?: number;
  /** 0 upcoming, 1 live, 2 finished. */
  s?: number;
  /** Result text, once there is one. */
  r?: string;
  /** Format id: 1 ODI, 2 T20, 3 Test, 4 T10, 5 The Hundred. */
  ft?: number;
}

export type ApiSeriesMatchesResponse = Record<string, ApiSeriesMatch[]>;

/** Raw schedule for one series, grouped by date. */
export function getApiSeriesMatches(
  seriesKey: string,
  opts: FetchOpts = {}
): Promise<ApiSeriesMatchesResponse> {
  return apiGet<ApiSeriesMatchesResponse>(
    `/series/matches?key=${encodeURIComponent(cleanKey(seriesKey))}`,
    { revalidate: 300, ...opts }
  );
}

/** Every row of a schedule, ungrouped. */
export const scheduleRows = (raw: ApiSeriesMatchesResponse | null | undefined): ApiSeriesMatch[] =>
  Object.values(raw ?? {}).flat();

/**
 * A match the live feed has aged out of, so its links don't 404. `/match/info`
 * answers for any age and names the series; that series' schedule row gives the
 * sides, venue, status and result; the card gives the innings. No `note` or
 * `playerOfMatch`: the upstream sends those only on the feed object.
 */
export async function getApiArchivedMatch(id: string, opts: FetchOpts = {}): Promise<Match | null> {
  const key = cleanKey(id);
  if (!key) return null;

  // Nothing on this path is live, so each endpoint keeps its own window rather than the caller's.
  const archived: FetchOpts = { signal: opts.signal };

  // The card only needs the key, so it is read alongside the info rather than after the schedule.
  const [info, card] = await Promise.all([
    apiGet<ApiMatchInfo>(`/match/info?key=${encodeURIComponent(key)}`, { ...archived, revalidate: 3600 }).catch(
      () => null
    ),
    apiGet<ApiScorecardBody>(`/match/scorecard?key=${encodeURIComponent(key)}`, {
      ...archived,
      revalidate: 3600,
    }).catch(() => null),
  ]);

  const seriesKey = cleanKey(info?.s);
  if (!seriesKey) return null;

  const schedule = await getApiSeriesMatches(seriesKey, archived).catch(() => null);
  const row = scheduleRows(schedule).find((m) => m?.mf === key);
  if (!row) return null;

  const status = scheduleStatus(row.s);
  const balls = scheduleBalls(row.ft);

  const [names, innings] = await Promise.all([
    resolveKeys(
      {
        t: [row.t1f ?? '', row.t2f ?? ''],
        v: [row.vf ?? '', info?.v ?? ''],
        s: [seriesKey],
      },
      archived
    ),
    // The upstream opens no innings slot before the first ball.
    status === 'UPCOMING' || !card
      ? []
      : scorecardFromRaw(card, { ...archived, revalidate: 3600, ballsPerOver: balls.ballsPerOver, status }).catch(
          () => []
        ),
  ]);

  const startedAt = row.t ?? (info?.dt ? Date.parse(info.dt) : NaN);

  return {
    id: key,
    homeTeam: toTeam(row.t1f ?? '', names),
    awayTeam: toTeam(row.t2f ?? '', names),
    series: seriesRef(seriesKey, names),
    format: scheduleFormat(row.ft),
    status,
    ...venueOf(row.vf || info?.v, names),
    startTime: new Date(Number.isFinite(startedAt) ? startedAt : Date.now()).toISOString(),
    ...balls,
    result: row.r || null,
    note: null,
    day: null,
    playerOfMatch: null,
    scorecard: innings.length ? { innings } : null,
  };
}

// A fixture without a match key is addressed by its series and schedule row id:
// `/matches/fx-2BG-47478`. Real keys never contain a dash, and once the upstream allocates
// a key the route redirects to it.
const SCHEDULED_ID_PREFIX = 'fx-';

/** The preview id for one row of a series schedule. */
export function scheduledMatchId(
  seriesKey: string | undefined,
  rowId: string | number | null | undefined
): string {
  return `${SCHEDULED_ID_PREFIX}${cleanKey(seriesKey)}-${rowId ?? ''}`;
}

/** The series and row an `fx-` id names, or null if this is not one. */
export function parseScheduledMatchId(
  id: string
): { seriesKey: string; rowId: string } | null {
  if (!id.startsWith(SCHEDULED_ID_PREFIX)) return null;
  const [seriesKey, rowId] = id.slice(SCHEDULED_ID_PREFIX.length).split('-');
  if (!seriesKey || !rowId) return null;
  return { seriesKey: cleanKey(seriesKey), rowId };
}

/**
 * An unallocated fixture's header, from its schedule row — there is no card, feed
 * or squad without a key. `id` comes back as the real key once the upstream has allocated
 * one, which the route redirects to.
 */
export async function getApiScheduledMatch(
  id: string,
  opts: FetchOpts = {}
): Promise<Match | null> {
  const parsed = parseScheduledMatchId(id);
  if (!parsed) return null;
  const { seriesKey, rowId } = parsed;

  // A fixture weeks out doesn't move at the caller's live pace; only the signal passes through.
  const scheduled: FetchOpts = { signal: opts.signal };

  const schedule = await getApiSeriesMatches(seriesKey, scheduled).catch(() => null);
  const row = scheduleRows(schedule).find((m) => m && String(m.id ?? '') === rowId);
  if (!row?.t) return null;

  const names = await resolveKeys(
    { t: [row.t1f ?? '', row.t2f ?? ''], v: [row.vf ?? ''], s: [seriesKey] },
    scheduled
  );

  return {
    id: cleanKey(row.mf) || id,
    homeTeam: toTeam(row.t1f ?? '', names),
    awayTeam: toTeam(row.t2f ?? '', names),
    series: seriesRef(seriesKey, names),
    format: scheduleFormat(row.ft),
    status: scheduleStatus(row.s),
    ...venueOf(row.vf, names),
    startTime: new Date(row.t).toISOString(),
    ...scheduleBalls(row.ft),
    result: row.r || null,
    note: null,
    day: null,
    playerOfMatch: null,
    scorecard: null,
  };
}
