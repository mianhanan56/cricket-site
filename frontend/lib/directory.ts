import type { RankingFormat, RankingGender, RankingRole, TeamCrest } from '@/types';
import type { Rankings } from './rankings';

export interface DirectoryPlayer {
  id: string;
  name: string;
  country: string;
  gender: RankingGender;
  /** Best position held across every list the player appears on. */
  best: { position: number; format: RankingFormat; role: RankingRole; rating: number };
  roles: RankingRole[];
}

export interface DirectoryTeam extends TeamCrest {
  gender: RankingGender;
  best: { position: number; format: RankingFormat; rating: number };
  /** Every format the side is ranked in. */
  ranks: Array<{ format: RankingFormat; position: number }>;
}

/** Everyone on a live ICC list, once each, keyed by crex f_key. */
export function rankedDirectory(rankings: Rankings): {
  players: DirectoryPlayer[];
  teams: DirectoryTeam[];
} {
  const players = new Map<string, DirectoryPlayer>();
  for (const byGender of Object.values(rankings.data)) {
    for (const byRole of Object.values(byGender)) {
      for (const rows of Object.values(byRole)) {
        for (const row of rows) {
          if (!row.playerKey) continue;
          const seen = players.get(row.playerKey);
          const best = { position: row.position, format: row.format, role: row.role, rating: row.rating };
          if (!seen) {
            players.set(row.playerKey, {
              id: row.playerKey,
              name: row.playerName,
              country: row.country,
              gender: row.gender,
              best,
              roles: [row.role],
            });
            continue;
          }
          if (!seen.roles.includes(row.role)) seen.roles.push(row.role);
          if (row.position < seen.best.position) seen.best = best;
        }
      }
    }
  }

  const teams = new Map<string, DirectoryTeam>();
  for (const byGender of Object.values(rankings.teams)) {
    for (const rows of Object.values(byGender)) {
      for (const row of rows) {
        if (!row.teamKey) continue;
        const seen = teams.get(row.teamKey);
        const best = { position: row.position, format: row.format, rating: row.rating };
        if (!seen) {
          teams.set(row.teamKey, {
            id: row.teamKey,
            name: row.teamName,
            shortName: row.shortName,
            logo: row.logo,
            gender: row.gender,
            best,
            ranks: [{ format: row.format, position: row.position }],
          });
        } else {
          seen.ranks.push({ format: row.format, position: row.position });
          if (row.position < seen.best.position) seen.best = best;
        }
      }
    }
  }

  const byBest = <T extends { best: { position: number }; name: string }>(a: T, b: T) =>
    a.best.position - b.best.position || a.name.localeCompare(b.name);

  return {
    players: [...players.values()].sort(byBest),
    teams: [...teams.values()].sort(byBest),
  };
}
