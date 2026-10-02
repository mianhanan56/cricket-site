/**
 * A player's record series by series: which series to offer, which to open on,
 * and the figures for one of them. Pure — the pages come in through a fetcher.
 */

import type {
  PlayerDiscipline,
  PlayerSeriesFormatRecord,
  PlayerSeriesInnings,
  PlayerSeriesPage,
  PlayerSeriesRecord,
} from '@/types';
import { DEFAULT_BALLS_PER_OVER, HUNDRED_BALLS_PER_OVER, oversFrom } from './overs';

// ---------------------------------------------------------------- Formats

/** URL value ↔ crex `ft`, in the order the filter shows them. */
export const SERIES_FORMATS = [
  { value: 'all', code: 0, label: 'All' },
  { value: 'test', code: 3, label: 'Test' },
  { value: 'odi', code: 1, label: 'ODI' },
  { value: 't20', code: 2, label: 'T20' },
  { value: 't10', code: 4, label: 'T10' },
  { value: '100b', code: 5, label: '100B' },
] as const;

export type SeriesFormatKey = (typeof SERIES_FORMATS)[number]['value'];

export const isSeriesFormatKey = (value: unknown): value is SeriesFormatKey =>
  SERIES_FORMATS.some((f) => f.value === value);

export const seriesFormatCode = (key: SeriesFormatKey): number =>
  SERIES_FORMATS.find((f) => f.value === key)?.code ?? 0;

/** The formats a player has played, with All in front when there is a choice to make. */
export function seriesFormatOptions(codes: number[]) {
  const played = SERIES_FORMATS.filter((f) => f.code !== 0 && codes.includes(f.code));
  return played.length > 1 ? [SERIES_FORMATS[0], ...played] : [];
}

/** Test and first-class cricket give each side two innings. */
export const isMultiInnings = (format: PlayerSeriesFormatRecord) => format.code === 3;

// ---------------------------------------------------------------- Lists

/** One discipline's pages read so far. `next` is null once crex has no older series. */
export interface DisciplineList {
  series: PlayerSeriesRecord[];
  next: number | null;
}

export type SeriesLists = Record<PlayerDiscipline, DisciplineList>;

export type PageFetcher = (discipline: PlayerDiscipline, page: number) => Promise<PlayerSeriesPage>;

const DISCIPLINES: PlayerDiscipline[] = ['batting', 'bowling'];

function appendPage(list: DisciplineList, page: number, data: PlayerSeriesPage): DisciplineList {
  const seen = new Set(list.series.map((s) => s.id));
  return {
    series: [...list.series, ...data.series.filter((s) => !seen.has(s.id))],
    next: data.more ? page + 1 : null,
  };
}

export async function firstLists(fetchPage: PageFetcher): Promise<SeriesLists> {
  const [batting, bowling] = await Promise.all(DISCIPLINES.map((d) => fetchPage(d, 0)));
  const empty: DisciplineList = { series: [], next: 0 };
  return { batting: appendPage(empty, 0, batting), bowling: appendPage(empty, 0, bowling) };
}

const startOf = (s: { start: string | null }) => s.start ?? '';

function oldestStart(list: DisciplineList): string {
  return list.series.reduce((min, s) => (startOf(s) < min ? startOf(s) : min), '￿');
}

/**
 * Whether a list has answered for a series. Pages run newest start first, so a
 * list with pages left has answered for everything that starts after the oldest
 * series it holds — and has not yet answered for anything starting at or before it.
 */
function covers(list: DisciplineList, series: PlayerSeriesRecord): boolean {
  if (list.next === null) return true;
  if (list.series.some((s) => s.id === series.id)) return true;
  return list.series.length > 0 && startOf(series) > oldestStart(list);
}

/** The discipline whose next page widens what can be shown, or null when both are read out. */
export function limitingDiscipline(lists: SeriesLists): PlayerDiscipline | null {
  const open = DISCIPLINES.filter((d) => lists[d].next !== null);
  if (!open.length) return null;
  return open.reduce((a, b) => (oldestStart(lists[a]) >= oldestStart(lists[b]) ? a : b));
}

export async function extendLists(lists: SeriesLists, fetchPage: PageFetcher): Promise<SeriesLists> {
  const discipline = limitingDiscipline(lists);
  if (!discipline) return lists;
  const page = lists[discipline].next as number;
  return { ...lists, [discipline]: appendPage(lists[discipline], page, await fetchPage(discipline, page)) };
}

/** A series with both disciplines' innings in it. */
export interface PlayerSeries {
  id: string;
  name: string;
  team: string | null;
  start: string | null;
  end: string | null;
  batting: PlayerSeriesFormatRecord[];
  bowling: PlayerSeriesFormatRecord[];
  /** Date of the player's latest innings in it, either discipline. */
  latest: string | null;
}

/**
 * Every series both lists have answered for, newest first. A series one list has
 * not reached yet is held back rather than shown with half its record missing.
 */
export function mergeLists(lists: SeriesLists): PlayerSeries[] {
  const byId = new Map<string, PlayerSeries>();

  for (const discipline of DISCIPLINES) {
    for (const record of lists[discipline].series) {
      if (!DISCIPLINES.every((d) => covers(lists[d], record))) continue;
      const entry = byId.get(record.id) ?? {
        id: record.id,
        name: record.name,
        team: record.team,
        start: record.start,
        end: record.end,
        batting: [],
        bowling: [],
        latest: null,
      };
      entry.team ??= record.team;
      entry[discipline] = record.formats.filter((f) => f.innings.length > 0);
      for (const inn of entry[discipline].flatMap((f) => f.innings)) {
        if (inn.date && (!entry.latest || inn.date > entry.latest)) entry.latest = inn.date;
      }
      byId.set(record.id, entry);
    }
  }

  return [...byId.values()]
    .filter((s) => s.batting.length > 0 || s.bowling.length > 0)
    .sort((a, b) => startOf(b).localeCompare(startOf(a)) || (b.latest ?? '').localeCompare(a.latest ?? ''));
}

/** Read older pages until the series is listed or there is nothing older. */
export async function listsCovering(
  lists: SeriesLists,
  seriesId: string,
  fetchPage: PageFetcher,
  maxPages: number
): Promise<SeriesLists> {
  let current = lists;
  for (let i = 0; i < maxPages; i++) {
    if (mergeLists(current).some((s) => s.id === seriesId) || !limitingDiscipline(current)) break;
    current = await extendLists(current, fetchPage);
  }
  return current;
}

const DAY_MS = 86_400_000;

/**
 * The series to open on: one still running, else the one that finished last,
 * else the one with the latest innings. crex's end date is midnight at the start
 * of the last day, so a series runs until a day after it.
 */
export function defaultSeries(series: PlayerSeries[], now: Date = new Date()): PlayerSeries | null {
  if (!series.length) return null;
  const t = now.getTime();
  const endOf = (s: PlayerSeries) => (s.end ? Date.parse(s.end) + DAY_MS : null);
  const byLatest = (a: PlayerSeries, b: PlayerSeries) => (b.latest ?? '').localeCompare(a.latest ?? '');

  const active = series.filter((s) => {
    const end = endOf(s);
    return s.start !== null && Date.parse(s.start) <= t && end !== null && end >= t;
  });
  if (active.length) return [...active].sort(byLatest)[0];

  const finished = series.filter((s) => (endOf(s) ?? Infinity) < t);
  if (finished.length) {
    return [...finished].sort((a, b) => (endOf(b) ?? 0) - (endOf(a) ?? 0) || byLatest(a, b))[0];
  }
  return [...series].sort(byLatest)[0];
}

// ---------------------------------------------------------------- Figures

const round2 = (n: number) => Math.round(n * 100) / 100;

const matchCount = (innings: PlayerSeriesInnings[]) =>
  new Set(innings.map((i) => i.matchId ?? `${i.matchLabel}|${i.date}`)).size;

export interface BattingSummary {
  matches: number;
  innings: number;
  runs: number;
  balls: number;
  notOuts: number;
  /** Runs per dismissal. Null when never dismissed. */
  average: number | null;
  strikeRate: number | null;
  /** With a `*` when unbeaten. */
  highest: string;
  fifties: number;
  hundreds: number;
}

export function battingSummary(innings: PlayerSeriesInnings[]): BattingSummary {
  const runs = innings.reduce((sum, i) => sum + i.runs, 0);
  const balls = innings.reduce((sum, i) => sum + i.balls, 0);
  const notOuts = innings.filter((i) => i.notOut).length;
  const dismissals = innings.length - notOuts;
  // An unbeaten score outranks a dismissal for the same runs, as a scorecard reads it.
  const top = innings.reduce<PlayerSeriesInnings | null>(
    (best, i) => (!best || i.runs > best.runs || (i.runs === best.runs && i.notOut && !best.notOut) ? i : best),
    null
  );

  return {
    matches: matchCount(innings),
    innings: innings.length,
    runs,
    balls,
    notOuts,
    average: dismissals > 0 ? round2(runs / dismissals) : null,
    strikeRate: balls > 0 ? round2((runs / balls) * 100) : null,
    highest: top ? `${top.runs}${top.notOut ? '*' : ''}` : '—',
    fifties: innings.filter((i) => i.runs >= 50 && i.runs < 100).length,
    hundreds: innings.filter((i) => i.runs >= 100).length,
  };
}

export interface BowlingSummary {
  matches: number;
  innings: number;
  balls: number;
  /** "31.2" — or the ball count in The Hundred, which has no overs to speak of. */
  workload: { value: string; unit: 'overs' | 'balls' };
  runs: number;
  wickets: number;
  /** Runs per six balls, or per five-ball set in The Hundred. */
  economy: number | null;
  average: number | null;
  /** Balls per wicket. */
  strikeRate: number | null;
  /** "3-41", the way the form list prints figures. */
  best: string | null;
  fourFors: number;
  fiveFors: number;
}

export function bowlingSummary(innings: PlayerSeriesInnings[], formatCode: number): BowlingSummary {
  const hundred = formatCode === 5;
  const perOver = hundred ? HUNDRED_BALLS_PER_OVER : DEFAULT_BALLS_PER_OVER;
  const balls = innings.reduce((sum, i) => sum + i.balls, 0);
  const runs = innings.reduce((sum, i) => sum + i.runs, 0);
  const wickets = innings.reduce((sum, i) => sum + i.wickets, 0);
  const best = innings.reduce<PlayerSeriesInnings | null>(
    (top, i) => (!top || i.wickets > top.wickets || (i.wickets === top.wickets && i.runs < top.runs) ? i : top),
    null
  );

  return {
    matches: matchCount(innings),
    innings: innings.length,
    balls,
    workload: hundred
      ? { value: String(balls), unit: 'balls' }
      : { value: String(oversFrom(balls, perOver)), unit: 'overs' },
    runs,
    wickets,
    economy: balls > 0 ? round2(runs / (balls / perOver)) : null,
    average: wickets > 0 ? round2(runs / wickets) : null,
    strikeRate: wickets > 0 ? round2(balls / wickets) : null,
    best: best ? `${best.wickets}-${best.runs}` : null,
    fourFors: innings.filter((i) => i.wickets === 4).length,
    fiveFors: innings.filter((i) => i.wickets >= 5).length,
  };
}
