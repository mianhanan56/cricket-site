// A series' honours board, from `i4` of the upstream's series overview (no stats endpoint
// answers). `i4.i` is keyed by format id and each category is a ONE-entry array:
// a single leader per category is all there is, hence a board, not a table.
import type { SeriesLeader, SeriesLeaderKind, SeriesLeaders } from '@/types';
import { apiGet, type FetchOpts } from './client';
import { cleanKey, playerImageUrl, resolveKeys, toTeam } from './names';

/** One category's leader. Players and teams are keys. */
interface ApiLeader {
  /** The category's own code, repeated inside the entry ("mr", "mw"). */
  name?: string;
  /** Team key. */
  tf?: string;
  /** Player key. */
  pf?: string;
  /** The headline figure: a string on counting categories ("416", "17/5"), a number on rates. */
  v?: string | number;
  /** Innings batted or bowled in. */
  bi?: string;
  /** Strike rate, on the batting categories. */
  sr?: number;
  /** Economy, on `mw`. */
  econ?: number;
  /** Runs a best strike rate came off — `bsr` only. */
  r?: string;
  /** Wickets a best economy was taken at — `bec` only. */
  w?: string;
}

/** The tournament's own tallies, sent beside the leaders. */
interface ApiLeaderTotals {
  t4?: string;
  t6?: string;
}

type ApiLeaderBlock = Partial<Record<string, ApiLeader[]>> & { totals?: ApiLeaderTotals };

/** The upstream's series overview. Of `i1`–`i9` only `i4`, the leaders, is read. */
interface ApiSeriesOverview {
  i4?: {
    /** Active format — which key of `i` the series is currently playing. */
    af?: number;
    /** Leaders by format id. */
    i?: Record<string, ApiLeaderBlock>;
  };
}

export function getApiSeriesOverview(
  seriesKey: string,
  opts: FetchOpts = {}
): Promise<ApiSeriesOverview> {
  return apiGet<ApiSeriesOverview>(
    `/series/overview?key=${encodeURIComponent(cleanKey(seriesKey))}`,
    { revalidate: 300, ...opts }
  );
}

/** A rate as printed: the upstream sends 169.7959, cricket prints 169.80. */
const rate = (n: number | undefined): string | null =>
  typeof n === 'number' && Number.isFinite(n) ? n.toFixed(2) : null;

/** The headline figure, whichever way the upstream typed it. */
function leaderValue(raw: ApiLeader['v']): string | null {
  if (typeof raw === 'number') return Number.isInteger(raw) ? String(raw) : rate(raw);
  const text = (raw ?? '').trim();
  return text || null;
}

/**
 * Best figures the way cricket writes them. The upstream sends runs first ("19/5"); flipped,
 * unless the second number is above ten and so cannot be wickets.
 */
function bowlingFigures(raw: ApiLeader['v']): string | null {
  const text = leaderValue(raw);
  if (!text || !text.includes('/')) return text;

  const [first, second] = text.split('/');
  const wickets = Number.parseInt(second ?? '', 10);
  if (!Number.isFinite(wickets) || wickets > 10) return text;
  return `${second}/${first}`;
}

const headline = (l: ApiLeader) => leaderValue(l.v);
const noSupport = () => null;

/** Category order, labels, and how each one's figure and footnote are built. */
const LEADER_SPECS: Array<{
  code: string;
  kind: SeriesLeaderKind;
  label: string;
  value: (l: ApiLeader) => string | null;
  support: (l: ApiLeader) => string | null;
}> = [
  { code: 'mr', kind: 'RUNS', label: 'Most runs', value: headline, support: (l) => (rate(l.sr) ? `SR ${rate(l.sr)}` : null) },
  { code: 'mw', kind: 'WICKETS', label: 'Most wickets', value: headline, support: (l) => (rate(l.econ) ? `Econ ${rate(l.econ)}` : null) },
  { code: 'hs', kind: 'HIGHEST_SCORE', label: 'Highest score', value: headline, support: (l) => (rate(l.sr) ? `SR ${rate(l.sr)}` : null) },
  { code: 'bf', kind: 'BEST_FIGURES', label: 'Best figures', value: (l) => bowlingFigures(l.v), support: noSupport },
  { code: 'ms', kind: 'SIXES', label: 'Most sixes', value: headline, support: noSupport },
  { code: 'mf', kind: 'FOURS', label: 'Most fours', value: headline, support: noSupport },
  // A strike rate means little without the runs it came off.
  { code: 'bsr', kind: 'STRIKE_RATE', label: 'Best strike rate', value: headline, support: (l) => (l.r ? `${l.r} runs` : null) },
  { code: 'bec', kind: 'ECONOMY', label: 'Best economy', value: headline, support: (l) => (l.w ? `${l.w} wkts` : null) },
  { code: 'md', kind: 'DOTS', label: 'Most dots', value: headline, support: noSupport },
  { code: 'mfp', kind: 'FANTASY', label: 'Most fantasy points', value: headline, support: noSupport },
];

const asTotal = (raw: string | undefined): number | null => {
  const n = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(n) ? n : null;
};

/**
 * Who leads the tournament, and in what; null where the upstream has no leaders (so the
 * section is dropped). On a multi-format tour the active leg (`af`) is used, else
 * the first.
 */
export async function getApiSeriesLeaders(
  seriesKey: string,
  opts: FetchOpts = {}
): Promise<SeriesLeaders | null> {
  const overview = await getApiSeriesOverview(seriesKey, opts);
  const blocks = overview.i4?.i ?? {};
  const keys = Object.keys(blocks);
  if (!keys.length) return null;

  const active = String(overview.i4?.af ?? '');
  const block = blocks[active] ?? blocks[keys[0]];
  if (!block) return null;

  const found = LEADER_SPECS.map((spec) => ({ spec, entry: block[spec.code]?.[0] })).filter(
    (row): row is { spec: (typeof LEADER_SPECS)[number]; entry: ApiLeader } =>
      Boolean(row.entry?.pf && row.spec.value(row.entry as ApiLeader))
  );
  if (!found.length) return null;

  const names = await resolveKeys(
    {
      p: found.map((r) => r.entry.pf ?? ''),
      t: found.map((r) => r.entry.tf ?? ''),
    },
    opts
  );

  const leaders: SeriesLeader[] = found.map(({ spec, entry }) => {
    const playerKey = cleanKey(entry.pf);
    const innings = Number.parseInt(entry.bi ?? '', 10);

    return {
      kind: spec.kind,
      label: spec.label,
      // Non-null: the filter above kept only the entries whose value resolved.
      value: spec.value(entry) as string,
      playerKey,
      playerName: names.p.get(playerKey)?.n ?? playerKey,
      playerImage: playerKey ? playerImageUrl(playerKey) : null,
      team: toTeam(cleanKey(entry.tf), names),
      innings: Number.isFinite(innings) ? innings : null,
      support: spec.support(entry),
    };
  });

  return {
    leaders,
    fours: asTotal(block.totals?.t4),
    sixes: asTotal(block.totals?.t6),
  };
}
