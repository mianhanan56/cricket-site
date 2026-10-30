import type { PlayerRole, SquadPlayer } from '@/types';

const ROLE_ORDER: PlayerRole[] = ['BATSMAN', 'WK', 'ALL_ROUNDER', 'BOWLER'];
const ROLE_LABEL: Record<PlayerRole, string> = {
  BATSMAN: 'Batters',
  WK: 'Wicket-keepers',
  ALL_ROUNDER: 'All-rounders',
  BOWLER: 'Bowlers',
};

// A player no source names a discipline for is listed, not filed under a guessed role.
export function squadGroups(squad: SquadPlayer[]) {
  return [...ROLE_ORDER, null]
    .map((role) => ({
      role: role ?? 'OTHER',
      label: role ? ROLE_LABEL[role] : 'Squad',
      players: squad
        .filter((p) => p.role === role)
        .sort((a, b) => Number(!!b.isCaptain) - Number(!!a.isCaptain)),
    }))
    .filter((g) => g.players.length);
}
