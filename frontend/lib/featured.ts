import type { Match } from '@/types';
import { isInternationalMatch, topSides } from './matchType';
import { matchStateOf } from './matchState';
import { liveEquation } from './telemetry';

/**
 * Order live matches by how much they deserve the stage: a followed side
 * first, then the top nations, then play actually happening, internationals, and tight chases.
 */
export function rankLive(matches: Match[], followedTeams: Set<string> = new Set()): Match[] {
  const score = (m: Match): number => {
    const state = matchStateOf(m);
    const eq = liveEquation(m);
    let s = 0;
    if (state.alive) s += 4;
    else if (state.family === 'interval' || state.family === 'transition') s += 2;
    if (isInternationalMatch(m)) s += 3;
    if (m.format !== 'TEST') s += 0.5;
    if (eq?.rrr != null && eq.crr != null && eq.crr > 0) {
      s += 1.5;
      const ratio = eq.rrr / eq.crr;
      if (ratio > 0.8 && ratio < 1.4) s += 1.5;
    }
    return s;
  };
  const followed = (m: Match): number =>
    Number(followedTeams.has(m.homeTeam.id) || followedTeams.has(m.awayTeam.id));
  return [...matches].sort(
    (a, b) => followed(b) - followed(a) || topSides(b) - topSides(a) || score(b) - score(a)
  );
}
