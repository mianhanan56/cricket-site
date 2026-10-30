// /fixtures: the upstream's date-wise schedule, 20 rows a page, page 0 starting today
// (negative pages run back in time). The live feed only reaches a day or two ahead.
import type { Match } from '@/types';
import { apiGet, inWidth, type FetchOpts } from './client';
import { scheduleFormat, scheduleStatus } from './codes';
import { cleanKey, resolveKeys, seriesRef, toTeam, venueOf, type NameCache } from './names';
import { scheduledMatchId } from './schedule';

/** One scheduled match as /fixtures (wise=1) sends it. */
export interface ApiFixtureRow {
  /** Absent on fixtures more than a few days out (linked by `scheduledMatchId` instead). */
  matchKey?: string;
  /** The upstream's own row id. Always present. */
  id?: number;
  team1Key?: string;
  team2Key?: string;
  seriesKey?: string;
  venueKey?: string;
  startTime?: number;
  /** 0 upcoming, 1 live, 2 finished. */
  status?: number;
  /** 1 ODI, 2 T20, 3 Test, 4 T10, 5 The Hundred. */
  format?: number;
  result?: string;
}

/** A scheduled match: `matchKey` is null until the upstream allocates one, and `id` is always openable. */
export interface Fixture extends Match {
  matchKey: string | null;
}

/** How far ahead the fixtures page reads: a month, plus whatever its last batch of pages carries. */
const FIXTURE_HORIZON_DAYS = 30;
/** A stop for a schedule busier than any seen; the Worker allows 60, and past the upstream's end a page wraps round. */
const FIXTURE_MAX_PAGES = 40;
/** Pages in flight at once — the corpus is 58 pages, and all at once is a burst on the Worker per cold render. */
const FIXTURE_FETCH_WIDTH = 8;

// The corpus the derived pages (venue records, form, head-to-head) are read from:
// about seven weeks back and two ahead. Every caller uses the same window so they
// share cache entries; nothing in it is live, hence the half-hour revalidate.
const CORPUS_BACK = 45;
const CORPUS_FORWARD = 12;
const CORPUS_REVALIDATE = 1800;

/** One page of the schedule. */
export function getApiFixtures(page = 0, opts: FetchOpts = {}): Promise<ApiFixtureRow[]> {
  return apiGet<ApiFixtureRow[]>(`/fixtures?wise=1&page=${page}`, {
    revalidate: 300,
    ...opts,
  });
}

function toFixture(row: ApiFixtureRow, names: NameCache): Fixture {
  const seriesKey = cleanKey(row.seriesKey);
  const matchKey = cleanKey(row.matchKey) || null;
  const status = scheduleStatus(row.status);

  return {
    id: matchKey ?? scheduledMatchId(seriesKey, row.id),
    matchKey,
    homeTeam: toTeam(row.team1Key ?? '', names),
    awayTeam: toTeam(row.team2Key ?? '', names),
    series: seriesRef(seriesKey, names),
    format: scheduleFormat(row.format),
    status,
    ...venueOf(row.venueKey, names),
    startTime: new Date(row.startTime ?? Date.now()).toISOString(),
    result: status === 'COMPLETED' ? row.result ?? null : null,
  };
}

export interface FixtureSchedule {
  /** Every match read, earliest first. */
  fixtures: Fixture[];
  /**
   * Start of the last match read, when the schedule carries on past it. Pages end
   * mid-day, so that day is partial. Null when the upstream ran out first.
   */
  coveredUntil: string | null;
}

/**
 * The schedule ahead, at least FIXTURE_HORIZON_DAYS of it, read in batches of pages
 * until a batch reaches the horizon. A failed page costs its own 20 rows only.
 */
export async function getApiFixtureSchedule(opts: FetchOpts = {}): Promise<FixtureSchedule> {
  const horizon = Date.now() + FIXTURE_HORIZON_DAYS * 86_400_000;
  const pages: ApiFixtureRow[][] = [];
  let latest = 0;
  let ended = false;

  for (let start = 0; start < FIXTURE_MAX_PAGES && !ended && latest < horizon; start += FIXTURE_FETCH_WIDTH) {
    const batch = Array.from({ length: Math.min(FIXTURE_FETCH_WIDTH, FIXTURE_MAX_PAGES - start) }, (_, i) => start + i);
    const settled = await Promise.all(batch.map((page) => getApiFixtures(page, opts).catch(() => null)));
    for (const rows of settled) {
      if (rows === null) continue;
      const times = rows.map((r) => r.startTime ?? 0).filter(Boolean);
      // An empty page, or one that jumps back in time, is the upstream past the end of its schedule.
      if (!times.length || (latest && Math.min(...times) < latest - 86_400_000)) {
        ended = true;
        break;
      }
      pages.push(rows);
      latest = Math.max(latest, ...times);
    }
  }

  return {
    fixtures: await fixturesFromRows(pages.flat(), opts),
    coveredUntil: ended || !latest ? null : new Date(latest).toISOString(),
  };
}

/**
 * The schedule behind today as well as ahead — the corpus every derived record is
 * filtered out of, since the upstream publishes no venue, form or head-to-head endpoint.
 * `back` and `forward` are page counts; keep the defaults so callers share a cache.
 */
export function getApiFixtureRange(
  opts: FetchOpts & { back?: number; forward?: number } = {}
): Promise<Fixture[]> {
  const back = opts.back ?? CORPUS_BACK;
  const forward = opts.forward ?? CORPUS_FORWARD;
  const pages: number[] = [];
  for (let p = -back; p <= forward; p++) pages.push(p);
  return fixturesFromPages(pages, { revalidate: CORPUS_REVALIDATE, ...opts });
}

/** One schedule page from today (page 0), names resolved — for lists that read on as they scroll. */
export async function getApiFixturesPage(page: number, opts: FetchOpts = {}): Promise<Fixture[]> {
  return fixturesFromRows(await getApiFixtures(page, opts), opts);
}

/** One series as /fixtures (wise=2) sends it, grouped under its month. */
interface ApiFixtureSeriesRow {
  seriesKey?: string;
  /** "17 September - 22 September". */
  dateRange?: string;
}

export interface SeriesCatalogueEntry {
  id: string;
  name: string;
  span: string;
}

// wise=2 pages step a month or two each. -60 is the Worker's floor (about four years
// back); the upstream's forward schedule runs dry by page 6.
const CATALOGUE_PAGES = { back: 60, forward: 6 };

/** Every series the upstream schedules, past few months onward — the live feed only knows today's. */
export async function getApiSeriesCatalogue(
  opts: FetchOpts & { back?: number } = {}
): Promise<SeriesCatalogueEntry[]> {
  const pages: number[] = [];
  for (let p = -(opts.back ?? CATALOGUE_PAGES.back); p <= CATALOGUE_PAGES.forward; p++) pages.push(p);
  // Nearest to today first: search breaks ties in index order, so "Asia Cup" leads with the current edition.
  pages.sort((a, b) => Math.abs(a) - Math.abs(b) || b - a);

  const settled = await inWidth(pages, FIXTURE_FETCH_WIDTH, (page) =>
    apiGet<Record<string, ApiFixtureSeriesRow[]>>(`/fixtures?wise=2&page=${page}`, { revalidate: 3600, ...opts }).catch(
      () => ({}) as Record<string, ApiFixtureSeriesRow[]>
    )
  );

  const spans = new Map<string, string>();
  for (const months of settled) {
    for (const rows of Object.values(months ?? {})) {
      for (const row of Array.isArray(rows) ? rows : []) {
        const key = cleanKey(row.seriesKey);
        if (key && !spans.has(key)) spans.set(key, row.dateRange ?? '');
      }
    }
  }

  const names = await resolveKeys({ s: spans.keys() }, opts);
  return [...spans].flatMap(([key, span]) => {
    const name = names.s.get(key)?.name;
    return name ? [{ id: key, name, span }] : [];
  });
}

async function fixturesFromPages(pages: number[], opts: FetchOpts = {}): Promise<Fixture[]> {
  const settled = await inWidth(pages, FIXTURE_FETCH_WIDTH, (page) =>
    getApiFixtures(page, opts).catch(() => [] as ApiFixtureRow[])
  );
  return fixturesFromRows(settled.flat(), opts);
}

async function fixturesFromRows(all: ApiFixtureRow[], opts: FetchOpts = {}): Promise<Fixture[]> {
  const seen = new Set<string>();
  const rows: ApiFixtureRow[] = [];
  for (const row of all) {
    if (!row?.startTime || !cleanKey(row.team1Key) || !cleanKey(row.team2Key)) continue;
    // A fixture can come once with its match key and once with only its id.
    const keys = [cleanKey(row.matchKey), row.id != null ? `id-${row.id}` : ''].filter(Boolean);
    if (keys.some((k) => seen.has(k))) continue;
    for (const k of keys) seen.add(k);
    rows.push(row);
  }

  const names = await resolveKeys(
    {
      t: rows.flatMap((r) => [r.team1Key ?? '', r.team2Key ?? '']),
      v: rows.map((r) => r.venueKey ?? ''),
      s: rows.map((r) => r.seriesKey ?? ''),
    },
    opts
  );

  return rows
    .map((r) => toFixture(r, names))
    .sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime));
}
