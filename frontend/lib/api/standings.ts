// /series/table: points tables. Every count arrives as a string.
import type { PointsTableGroup, PointsTableRow } from '@/types';
import { apiGet, type FetchOpts } from './client';
import { cleanKey, resolveKeys, toTeam } from './names';

interface ApiPointsRow {
  teamKey?: string;
  teamName?: string;
  played?: string;
  won?: string;
  lost?: string;
  /** Limited-overs tables only. A Test table sends `drawn` instead. */
  noResult?: string;
  /** Test tables only. */
  drawn?: string;
  points?: string;
  /** "0" on a Test table, where the figure does not exist. */
  netRunRate?: string;
  /** Last five, oldest first: ["W","L","W","W","W"]. */
  form?: string[];
  /** 1 when through to the knockouts. */
  qualified?: number;
  eliminated?: number;
  /** 1 when the side lifted the trophy. */
  champion?: number;
}

/** One group. A league sends a single entry; a group stage sends one per group. */
interface ApiPointsGroup {
  name?: string;
  rows?: ApiPointsRow[];
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

/** The upstream's form letters. Anything else — an abandoned game — reads as a no-result. */
function formLetter(raw: string): 'W' | 'L' | 'N' {
  const c = (raw ?? '').trim().toUpperCase();
  return c === 'W' ? 'W' : c === 'L' ? 'L' : 'N';
}

/**
 * `form` can carry the side's results from other series and formats too (an ODI table at
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
 * sends `points` but fills it with zeros; three (a tri-series) is the smallest that awards points.
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
  const groups = (Array.isArray(raw) ? raw : []).filter((g) => g?.rows?.length);
  if (!groups.length) return [];

  const names = await resolveKeys(
    { t: groups.flatMap((g) => (g.rows ?? []).map((r) => r.teamKey ?? '')) },
    opts
  );

  // Above a single table the group's name is just the competition's name again.
  const named = groups.length > 1;

  return groups.map((g) => ({
    name: named ? g.name?.trim() || null : null,
    tournament: (g.rows?.length ?? 0) >= MIN_TABLE_ROWS,
    // Rows arrive in standings order. The upstream's own `rank` goes stale against it, so isn't forwarded.
    rows: (g.rows ?? [])
      .map((r, i) => {
        const teamKey = cleanKey(r.teamKey);
        const team = toTeam(teamKey, names);
        const played = asCount(r.played);
        const won = asCount(r.won);
        const lost = asCount(r.lost);

        return {
          teamKey,
          // The row's own name is used only where the mapping has none, so the app names a side one way.
          team: team.name === teamKey && r.teamName ? { ...team, name: r.teamName } : team,
          rank: i + 1,
          played,
          won,
          lost,
          noResult: asOptionalCount(r.noResult),
          drawn: asOptionalCount(r.drawn),
          points: asCount(r.points),
          netRunRate: nullableRate(r.netRunRate),
          form: tableForm((r.form ?? []).map(formLetter), played, won, lost),
          qualified: r.qualified === 1,
          eliminated: r.eliminated === 1,
          champion: r.champion === 1,
        } satisfies PointsTableRow;
      }),
  }));
}
