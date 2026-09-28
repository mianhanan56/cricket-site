import type { RankingFormat, RankingGender, RankingRole } from '@/types';
import type { RankingsData } from './rankings';
import type { PlayersFormatKey, PlayersRoleKey, RankingsGender } from './tabs';

export interface DirectoryRanking {
  role: RankingRole;
  format: RankingFormat;
  position: number;
  rating: number;
}

export interface DirectoryRow {
  id: string;
  name: string;
  country: string;
  gender: RankingGender;
  crest: { shortName: string; logo: string | null } | null;
  /** Every list the player is on — one per discipline × format. */
  rankings: DirectoryRanking[];
}

export interface DirectoryItem {
  row: DirectoryRow;
  /** The position this row is ranked by: best in the section's discipline and the chosen format. */
  best: DirectoryRanking;
  /** The same discipline's other formats, when no format is chosen. */
  others: DirectoryRanking[];
}

export interface DirectorySection {
  role: RankingRole;
  items: DirectoryItem[];
}

export interface DirectoryFilters {
  gender: RankingsGender;
  role: PlayersRoleKey;
  format: PlayersFormatKey;
  query: string;
}

export const ROLE_ORDER: readonly RankingRole[] = ['BATTING', 'BOWLING', 'ALLROUNDER'];
export const FORMAT_ORDER: readonly RankingFormat[] = ['TEST', 'ODI', 'T20I'];

const ROLE_OF_KEY: Record<Exclude<PlayersRoleKey, 'all'>, RankingRole> = {
  batting: 'BATTING',
  bowling: 'BOWLING',
  'all-rounder': 'ALLROUNDER',
};
const FORMAT_OF_KEY: Record<Exclude<PlayersFormatKey, 'all'>, RankingFormat> = {
  test: 'TEST',
  odi: 'ODI',
  t20i: 'T20I',
};
const GENDER_OF_KEY: Record<RankingsGender, RankingGender> = { men: 'MEN', women: 'WOMEN' };

/** Every ranking entry, grouped by crex player key. Rows without a key can't link to a profile. */
export function rankingsByPlayer(data: RankingsData): Map<string, DirectoryRanking[]> {
  const out = new Map<string, DirectoryRanking[]>();
  for (const byGender of Object.values(data)) {
    for (const byRole of Object.values(byGender)) {
      for (const rows of Object.values(byRole)) {
        for (const r of rows) {
          if (!r.playerKey) continue;
          const list = out.get(r.playerKey) ?? [];
          list.push({ role: r.role, format: r.format, position: r.position, rating: r.rating });
          out.set(r.playerKey, list);
        }
      }
    }
  }
  return out;
}

const byRank = (a: DirectoryRanking, b: DirectoryRanking) =>
  a.position - b.position || FORMAT_ORDER.indexOf(a.format) - FORMAT_ORDER.indexOf(b.format);

function matchesQuery(row: DirectoryRow, terms: string[]) {
  const hay = `${row.name} ${row.country}`.toLowerCase();
  return terms.every((t) => hay.includes(t));
}

/**
 * One section per discipline. A player ranked in two disciplines appears in
 * both, because a position only means something within its own list.
 */
export function filterDirectory(rows: DirectoryRow[], f: DirectoryFilters): DirectorySection[] {
  const gender = GENDER_OF_KEY[f.gender];
  const format = f.format === 'all' ? null : FORMAT_OF_KEY[f.format];
  const roles = f.role === 'all' ? ROLE_ORDER : [ROLE_OF_KEY[f.role]];
  const terms = f.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const pool = rows.filter((r) => r.gender === gender && matchesQuery(r, terms));

  return roles
    .map((role) => {
      const items: DirectoryItem[] = [];
      for (const row of pool) {
        const inRole = row.rankings.filter((r) => r.role === role).sort(byRank);
        const matching = format ? inRole.filter((r) => r.format === format) : inRole;
        if (!matching.length) continue;
        const best = matching[0];
        const others = format
          ? []
          : inRole
              .filter((r) => r !== best)
              .sort((a, b) => FORMAT_ORDER.indexOf(a.format) - FORMAT_ORDER.indexOf(b.format));
        items.push({ row, best, others });
      }
      items.sort((a, b) => byRank(a.best, b.best) || a.row.name.localeCompare(b.row.name));
      return { role, items };
    })
    .filter((s) => s.items.length > 0);
}
