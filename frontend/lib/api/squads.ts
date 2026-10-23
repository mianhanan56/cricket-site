// /series/squads: each side's named squad for a series — announced weeks before
// any match XI, so it is what a preview shows.
import type { Match, MatchSquads, PlayerRole, SquadPlayer } from '@/types';
import { apiGet, type FetchOpts } from './client';
import { getApiMatchInfo } from './matchInfo';
import { cleanKey, resolveKeys } from './names';
import { getApiSeriesSchedule } from './series';

/** One side's squad for one series. Players are keys. */
interface ApiSeriesSquad {
  /** Team key. */
  tf?: string;
  /** Format id, the same vocabulary as `ft` elsewhere. */
  ft?: number;
  /** The squad. */
  pf?: string[];
  /** Captain — an array, though it holds one key. */
  c?: string[];
  /** Vice captain. */
  vc?: string[];
  /** Overseas players. */
  f?: string[];
  /** Wicket-keeper. */
  iw?: string[];
}

/** Every side's squad for a series. */
export function getApiSeriesSquads(
  seriesKey: string,
  opts: FetchOpts = {}
): Promise<ApiSeriesSquad[]> {
  return apiGet<ApiSeriesSquad[]>(
    `/series/squads?key=${encodeURIComponent(cleanKey(seriesKey))}`,
    { revalidate: 3600, ...opts }
  );
}

/**
 * One side's named squad, or [] where the upstream has none. The list marks only keepers;
 * other roles come from the side's own match squads in the series, and a player
 * neither names keeps a null role.
 */
export async function getApiTeamSquad(
  seriesKey: string,
  teamKey: string,
  opts: FetchOpts = {}
): Promise<SquadPlayer[]> {
  const want = cleanKey(teamKey);
  // Independent of the squad list, so it runs alongside it; it never rejects.
  const rolesRead = seriesRoles(seriesKey, want, opts);
  const all = await getApiSeriesSquads(seriesKey, opts);

  // A side can be listed once per format; the longest list (a Test squad) is the one to show.
  const mine = (Array.isArray(all) ? all : [])
    .filter((sq) => cleanKey(sq.tf) === want && sq.pf?.length)
    .sort((a, b) => (b.pf?.length ?? 0) - (a.pf?.length ?? 0))[0];
  if (!mine?.pf?.length) return [];

  const captains = new Set((mine.c ?? []).map(cleanKey));
  const keepers = new Set((mine.iw ?? []).map(cleanKey));
  const names = await resolveKeys({ p: mine.pf }, opts);

  const named = mine.pf
    .map((raw) => {
      const id = cleanKey(raw);
      const name = names.p.get(id)?.n;
      // A key the mapping cannot name is dropped: "5YW" in a squad list tells the reader nothing.
      if (!id || !name) return null;
      const player: SquadPlayer = {
        id,
        name,
        role: keepers.has(id) ? 'WK' : null,
        isCaptain: captains.has(id) || undefined,
      };
      return player;
    })
    .filter((p): p is SquadPlayer => p !== null);

  const roles = await rolesRead;
  return named.map((p) => (p.role === null ? { ...p, role: roles.get(p.id) ?? null } : p));
}

// Two matches name nearly every player a tour uses; more is requests for little.
const ROLE_SOURCE_MATCHES = 2;

/**
 * Each player's discipline for one side, from its own match squads in a series.
 * Upcoming matches first — the upstream prunes a squad once play starts — then the latest played.
 */
async function seriesRoles(seriesKey: string, teamKey: string, opts: FetchOpts): Promise<Map<string, PlayerRole>> {
  const schedule = await getApiSeriesSchedule(seriesKey, opts).catch(() => null);
  const mine = (schedule?.matches ?? []).filter(
    (m) => m.matchKey && (m.homeTeam.id === teamKey || m.awayTeam.id === teamKey)
  );
  const keys = [
    ...mine.filter((m) => m.status === 'UPCOMING'),
    ...mine.filter((m) => m.status !== 'UPCOMING').reverse(),
  ]
    .slice(0, ROLE_SOURCE_MATCHES)
    .map((m) => m.matchKey as string);

  const roles = new Map<string, PlayerRole>();
  const infos = await Promise.all(keys.map((k) => getApiMatchInfo(k, opts).catch(() => null)));
  for (const info of infos) {
    for (const p of info?.squads[teamKey] ?? []) {
      // A keeper is marked over the role in a match squad, so it says nothing about discipline.
      if (p.role && p.role !== 'WK' && !roles.has(p.id)) roles.set(p.id, p.role);
    }
  }
  return roles;
}

/**
 * Both sides' series squads for a match — the wider party, not the XI. The match
 * page prefers an announced XI where there is one. Null when the upstream names neither side.
 */
export async function getApiMatchSeriesSquads(
  match: Pick<Match, 'series' | 'homeTeam' | 'awayTeam'>,
  opts: FetchOpts = {}
): Promise<MatchSquads | null> {
  const seriesKey = cleanKey(match.series?.id);
  if (!seriesKey) return null;

  const [home, away] = await Promise.all([
    getApiTeamSquad(seriesKey, match.homeTeam.id, opts).catch(() => [] as SquadPlayer[]),
    getApiTeamSquad(seriesKey, match.awayTeam.id, opts).catch(() => [] as SquadPlayer[]),
  ]);

  return home.length || away.length ? { home, away } : null;
}
