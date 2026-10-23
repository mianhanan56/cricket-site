// /series/table: points tables. Not obfuscated — the upstream sends its own column
// headings (`P`, `W`, `Pts`, `NRR`), every count as a string.
import type { PointsTableGroup, PointsTableRow } from '@/types';
import { apiGet, type FetchOpts } from './client';
import { cleanKey, resolveKeys, toTeam } from './names';

interface ApiPointsRow {
  team_fkey?: string;
  team_name?: string;
  P?: string;
  W?: string;
  L?: string;
  /** Limited-overs tables only. A Test table sends `Draw` instead. */
  NR?: string;
  /** Test tables only. */
  Draw?: string;
  Pts?: string;
  /** "0" on a Test table, where the figure does not exist. */
  NRR?: string;
  /** The upstream's position — goes stale against the array order, which is the one to trust. */
  rank?: number;
  /** Last five, oldest first: ["W","L","W","W","W"]. */
  rf?: string[];
  qualified?: number;
  eliminated?: number;
  is_winner?: number;
}

/** One group. A league sends a single entry; a group stage sends one per group. */
interface ApiPointsGroup {
  g_name?: string;
  pt_info?: ApiPointsRow[];
}

function getApiPointsTable(
  seriesKey: string,
  opts: FetchOpts = {}
): Promise<ApiPointsGroup[]> {
  return apiGet<ApiPointsGroup[]>(
    `/series/table?key=${encodeURIComponent(cleanKey(seriesKey))}`,
    { revalidate: 300, ...opts }
  );
}

/** The upstream's `rf` letters. Anything else — an abandoned game — reads as a no-result. */
function formLetter(raw: string): 'W' | 'L' | 'N' {
  const c = (raw ?? '').trim().toUpperCase();
  return c === 'W' ? 'W' : c === 'L' ? 'L' : 'N';
}

/**
 * `rf` can carry the side's results from other series and formats too (an ODI table at
 * Played 0 sent five), so only form this row's own counts can account for is shown.
 */
function tableForm(form: Array<'W' | 'L' | 'N'>, played: number, won: number, lost: number): Array<'W' | 'L' | 'N'> {
  const own = played > 0 ? form.slice(-played) : [];
  const count = (c: 'W' | 'L' | 'N') => own.filter((x) => x === c).length;
  return count('W') <= won && count('L') <= lost && count('N') <= played - won - lost ? own : [];
}

const asCount = (raw: string | undefined): number => {
  const n = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(n) ? n : 0;
};

/** Null when the column is absent, so a Test table doesn't draw an empty NR column. */
const asOptionalCount = (raw: string | undefined): number | null =>
  raw === undefined ? null : asCount(raw);

/**
 * Sides a group needs to be a tournament. Two is a bilateral tour, where the upstream still
 * sends `Pts` but fills it with zeros; three (a tri-series) is the smallest that awards points.
 */
const MIN_TABLE_ROWS = 3;

/** NRR, or null on formats without one (the upstream sends "0" on a Test table). */
function nullableRate(raw: string | undefined): string | null {
  const text = (raw ?? '').trim();
  if (!text || text === '0' || text === '0.000' || text === '-') return null;
  return text;
}

/**
 * A series' standings, one table per group (flattening groups would rank Group A's
 * third above Group B's leader). Empty for a series with no table, which is most
 * bilateral tours — a normal answer, not a failure.
 */
export async function getApiSeriesTable(
  seriesKey: string,
  opts: FetchOpts = {}
): Promise<PointsTableGroup[]> {
  const raw = await getApiPointsTable(seriesKey, opts);
  // A table of zeros still names the sides; only an empty group is dropped.
  const groups = (Array.isArray(raw) ? raw : []).filter((g) => g?.pt_info?.length);
  if (!groups.length) return [];

  const names = await resolveKeys(
    { t: groups.flatMap((g) => (g.pt_info ?? []).map((r) => r.team_fkey ?? '')) },
    opts
  );

  // Above a single table `g_name` is just the competition's name again.
  const named = groups.length > 1;

  return groups.map((g) => ({
    name: named ? g.g_name?.trim() || null : null,
    tournament: (g.pt_info?.length ?? 0) >= MIN_TABLE_ROWS,
    // Rows arrive in standings order; position is the row's place in the list, not `rank`.
    rows: (g.pt_info ?? [])
      .map((r, i) => {
        const teamKey = cleanKey(r.team_fkey);
        const team = toTeam(teamKey, names);
        const played = asCount(r.P);
        const won = asCount(r.W);
        const lost = asCount(r.L);

        return {
          teamKey,
          // The row's own name is used only where the mapping has none, so the app names a side one way.
          team: team.name === teamKey && r.team_name ? { ...team, name: r.team_name } : team,
          rank: i + 1,
          played,
          won,
          lost,
          noResult: asOptionalCount(r.NR),
          drawn: asOptionalCount(r.Draw),
          points: asCount(r.Pts),
          netRunRate: nullableRate(r.NRR),
          form: tableForm((r.rf ?? []).map(formLetter), played, won, lost),
          qualified: r.qualified === 1,
          eliminated: r.eliminated === 1,
          champion: r.is_winner === 1,
        } satisfies PointsTableRow;
      }),
  }));
}
