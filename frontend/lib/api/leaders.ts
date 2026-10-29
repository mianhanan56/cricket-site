// A series' honours board, from the leaders block of the upstream's series overview (no
// stats endpoint answers). Each category is a ONE-entry array: a single leader per
// category is all there is, hence a board, not a table.
import type { SeriesLeader, SeriesLeaderKind, SeriesLeaders } from '@/types';
import { apiGet, type FetchOpts } from './client';
import { cleanKey, playerImageUrl, resolveKeys, toTeam } from './names';

/** One category's leader. */
interface ApiLeader {
  teamKey?: string;
  playerKey?: string;
  /** The headline figure: a string on counting categories ("416", "17/5"), a number on rates. */
  value?: string | number;
  /** Innings batted or bowled in. */
  innings?: string;
  /** `mostRuns` and `highestScore` only. */
  strikeRate?: number;
  /** `mostWickets` only. */
  economy?: number;
  /** Runs a best strike rate came off — `bestStrikeRate` only. */
  runs?: string;
  /** Wickets a best economy was taken at — `bestEconomy` only. */
  wickets?: string;
}

/** The tournament's own tallies, sent beside the leaders. */
interface ApiLeaderTotals {
  fours?: string;
  sixes?: string;
}

interface ApiLeaderBlock {
  mostRuns?: ApiLeader[];
  mostWickets?: ApiLeader[];
  highestScore?: ApiLeader[];
  bestFigures?: ApiLeader[];
  mostSixes?: ApiLeader[];
  mostFours?: ApiLeader[];
  bestStrikeRate?: ApiLeader[];
  bestEconomy?: ApiLeader[];
  totals?: ApiLeaderTotals;
}

type LeaderCategory = Exclude<keyof ApiLeaderBlock, 'totals'>;

/** The upstream's series overview; the Worker forwards only its leaders. */
interface ApiSeriesOverview {
  leaders?: {
    /** Which key of `byFormat` the series is currently playing. */
    activeFormat?: number;
    /** Keyed by format id. The Worker already trims this to the one leg picked below. */
    byFormat?: Record<string, ApiLeaderBlock>;
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
function leaderValue(raw: ApiLeader['value']): string | null {
  if (typeof raw === 'number') return Number.isInteger(raw) ? String(raw) : rate(raw);
  const text = (raw ?? '').trim();
  return text || null;
}

/**
 * Best figures the way cricket writes them. The upstream sends runs first ("19/5"); flipped,
 * unless the second number is above ten and so cannot be wickets.
 */
function bowlingFigures(raw: ApiLeader['value']): string | null {
  const text = leaderValue(raw);
  if (!text || !text.includes('/')) return text;

  const [first, second] = text.split('/');
  const wickets = Number.parseInt(second ?? '', 10);
  if (!Number.isFinite(wickets) || wickets > 10) return text;
  return `${second}/${first}`;
}

const headline = (l: ApiLeader) => leaderValue(l.value);
const noSupport = () => null;

/** Category order, labels, and how each one's figure and footnote are built. */
const LEADER_SPECS: Array<{
  category: LeaderCategory;
  kind: SeriesLeaderKind;
  label: string;
  value: (l: ApiLeader) => string | null;
  support: (l: ApiLeader) => string | null;
}> = [
  { category: 'mostRuns', kind: 'RUNS', label: 'Most runs', value: headline, support: (l) => (rate(l.strikeRate) ? `SR ${rate(l.strikeRate)}` : null) },
  { category: 'mostWickets', kind: 'WICKETS', label: 'Most wickets', value: headline, support: (l) => (rate(l.economy) ? `Econ ${rate(l.economy)}` : null) },
  { category: 'highestScore', kind: 'HIGHEST_SCORE', label: 'Highest score', value: headline, support: (l) => (rate(l.strikeRate) ? `SR ${rate(l.strikeRate)}` : null) },
  { category: 'bestFigures', kind: 'BEST_FIGURES', label: 'Best figures', value: (l) => bowlingFigures(l.value), support: noSupport },
  { category: 'mostSixes', kind: 'SIXES', label: 'Most sixes', value: headline, support: noSupport },
  { category: 'mostFours', kind: 'FOURS', label: 'Most fours', value: headline, support: noSupport },
  // A strike rate means little without the runs it came off.
  { category: 'bestStrikeRate', kind: 'STRIKE_RATE', label: 'Best strike rate', value: headline, support: (l) => (l.runs ? `${l.runs} runs` : null) },
  { category: 'bestEconomy', kind: 'ECONOMY', label: 'Best economy', value: headline, support: (l) => (l.wickets ? `${l.wickets} wkts` : null) },
];

const asTotal = (raw: string | undefined): number | null => {
  const n = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(n) ? n : null;
};

/**
 * Who leads the tournament, and in what; null where the upstream has no leaders (so the
 * section is dropped). On a multi-format tour the active leg is used, else the first.
 */
export async function getApiSeriesLeaders(
  seriesKey: string,
  opts: FetchOpts = {}
): Promise<SeriesLeaders | null> {
  const overview = await getApiSeriesOverview(seriesKey, opts);
  const blocks = overview.leaders?.byFormat ?? {};
  const keys = Object.keys(blocks);
  if (!keys.length) return null;

  const active = String(overview.leaders?.activeFormat ?? '');
  const block = blocks[active] ?? blocks[keys[0]];
  if (!block) return null;

  const found = LEADER_SPECS.map((spec) => ({ spec, entry: block[spec.category]?.[0] })).filter(
    (row): row is { spec: (typeof LEADER_SPECS)[number]; entry: ApiLeader } =>
      Boolean(row.entry?.playerKey && row.spec.value(row.entry as ApiLeader))
  );
  if (!found.length) return null;

  const names = await resolveKeys(
    {
      p: found.map((r) => r.entry.playerKey ?? ''),
      t: found.map((r) => r.entry.teamKey ?? ''),
    },
    opts
  );

  const leaders: SeriesLeader[] = found.map(({ spec, entry }) => {
    const playerKey = cleanKey(entry.playerKey);
    const innings = Number.parseInt(entry.innings ?? '', 10);

    return {
      kind: spec.kind,
      label: spec.label,
      // Non-null: the filter above kept only the entries whose value resolved.
      value: spec.value(entry) as string,
      playerName: names.p.get(playerKey)?.name ?? playerKey,
      playerImage: playerKey ? playerImageUrl(playerKey) : null,
      team: toTeam(cleanKey(entry.teamKey), names),
      innings: Number.isFinite(innings) ? innings : null,
      support: spec.support(entry),
    };
  });

  return {
    leaders,
    fours: asTotal(block.totals?.fours),
    sixes: asTotal(block.totals?.sixes),
  };
}
