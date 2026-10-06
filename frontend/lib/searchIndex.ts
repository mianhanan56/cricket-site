'use client';

import type { Match, TeamCrest } from '@/types';
import { createPersisted } from './persisted';
import { withTimeout } from './timeout';
import { isAtStumps } from './matchState';
import { getCrexMatchList, getCrexScorecard } from './crex';

export type EntityType = 'match' | 'team' | 'player' | 'series' | 'venue';

export interface SearchEntity {
  type: EntityType;
  id: string;
  label: string;
  sub: string;
  href: string;
  /** Lowercased text every query term is matched against. */
  hay: string;
  status?: Match['status'];
  /** In progress but between days — tagged Stumps, never Live. */
  stumps?: boolean;
  logo?: string | null;
}

const REMOTE_TIMEOUT_MS = 15_000;

export interface RemoteIndex {
  players: Array<{ id: string; name: string; country: string }>;
  teams: TeamCrest[];
}

let remote: RemoteIndex | null = null;
let remoteInflight: Promise<RemoteIndex | null> | null = null;

export function loadRemoteIndex(): Promise<RemoteIndex | null> {
  if (remote) return Promise.resolve(remote);
  if (remoteInflight) return remoteInflight;
  remoteInflight = fetch('/api/search-index', { signal: withTimeout(REMOTE_TIMEOUT_MS) })
    .then((r) => (r.ok ? (r.json() as Promise<RemoteIndex>) : null))
    .then((data) => {
      remote = data;
      return data;
    })
    .catch(() => null)
    .finally(() => {
      remoteInflight = null;
    });
  return remoteInflight;
}

/** Live games' cards are re-read at most this often for their players. */
const LIVE_PLAYERS_MS = 2 * 60_000;
const LIVE_CARDS_MAX = 10;

let livePlayers: { at: number; players: RemoteIndex['players'] } | null = null;
let livePlayersInflight: Promise<RemoteIndex['players']> | null = null;

/** Everyone on a live match's card: the ranked index alone misses most domestic and A-team players. */
function loadLivePlayers(): Promise<RemoteIndex['players']> {
  if (livePlayers && Date.now() - livePlayers.at < LIVE_PLAYERS_MS) return Promise.resolve(livePlayers.players);
  if (livePlayersInflight) return livePlayersInflight;
  livePlayersInflight = getCrexMatchList({ signal: withTimeout(REMOTE_TIMEOUT_MS) })
    .then(async (matches) => {
      const live = matches.filter((m) => m.status === 'LIVE').slice(0, LIVE_CARDS_MAX);
      const cards = await Promise.all(
        live.map((m) =>
          getCrexScorecard(m.id, { ballsPerOver: m.ballsPerOver, signal: withTimeout(REMOTE_TIMEOUT_MS) })
            .then((innings) => ({ m, innings }))
            .catch(() => ({ m, innings: [] }))
        )
      );
      const byId = new Map<string, RemoteIndex['players'][number]>();
      for (const { m, innings } of cards) {
        for (const inn of innings) {
          const batting = inn.teamId === m.awayTeam.id ? m.awayTeam : m.homeTeam;
          const bowling = batting === m.homeTeam ? m.awayTeam : m.homeTeam;
          const add = (p: { playerId: string; name: string }, side: typeof batting) => {
            // An unresolved player prints as its raw key; nothing to search on.
            if (p.playerId && p.name && p.name !== p.playerId && !byId.has(p.playerId)) {
              byId.set(p.playerId, { id: p.playerId, name: p.name, country: side.shortName });
            }
          };
          for (const p of [...(inn.batting ?? []), ...(inn.yetToBat ?? [])]) add(p, batting);
          for (const p of inn.bowling ?? []) add(p, bowling);
        }
      }
      const players = [...byId.values()];
      livePlayers = { at: Date.now(), players };
      return players;
    })
    .catch(() => livePlayers?.players ?? [])
    .finally(() => {
      livePlayersInflight = null;
    });
  return livePlayersInflight;
}

/** The ranked index plus the players in today's live games. */
export async function loadSearchIndex(): Promise<RemoteIndex | null> {
  const [ranked, live] = await Promise.all([loadRemoteIndex(), loadLivePlayers()]);
  if (!ranked && !live.length) return null;
  const known = new Set((ranked?.players ?? []).map((p) => p.id));
  return {
    teams: ranked?.teams ?? [],
    players: [...(ranked?.players ?? []), ...live.filter((p) => !known.has(p.id))],
  };
}

const STATUS_WORD: Record<Match['status'], string> = { LIVE: 'Live', UPCOMING: 'Upcoming', COMPLETED: 'Result' };

export function buildIndex(matches: Match[], index: RemoteIndex | null): SearchEntity[] {
  const out: SearchEntity[] = [];
  const teams = new Map<string, SearchEntity>();
  const series = new Map<string, SearchEntity>();
  const venues = new Map<string, SearchEntity>();

  for (const m of matches) {
    out.push({
      type: 'match',
      id: m.id,
      label: `${m.homeTeam.shortName} vs ${m.awayTeam.shortName}`,
      sub: m.series.name,
      href: `/matches/${m.id}`,
      status: m.status,
      stumps: isAtStumps(m),
      hay: [m.homeTeam.name, m.homeTeam.shortName, m.awayTeam.name, m.awayTeam.shortName, m.series.name, m.venue, m.format, isAtStumps(m) ? 'Stumps' : STATUS_WORD[m.status]]
        .join(' ')
        .toLowerCase(),
    });

    for (const t of [m.homeTeam, m.awayTeam]) {
      if (!t.id || teams.has(t.id)) continue;
      teams.set(t.id, {
        type: 'team',
        id: t.id,
        label: t.name,
        sub: t.shortName,
        href: `/teams/${t.id}`,
        logo: t.logo,
        hay: `${t.name} ${t.shortName}`.toLowerCase(),
      });
    }

    if (m.series.id && !series.has(m.series.id)) {
      series.set(m.series.id, {
        type: 'series',
        id: m.series.id,
        label: m.series.name,
        sub: m.format,
        href: `/series/${m.series.id}`,
        hay: m.series.name.toLowerCase(),
      });
    }

    if (m.venueId && !venues.has(m.venueId)) {
      venues.set(m.venueId, {
        type: 'venue',
        id: m.venueId,
        label: m.venue,
        sub: 'Venue',
        href: `/venues/${m.venueId}`,
        hay: m.venue.toLowerCase(),
      });
    }
  }

  for (const t of index?.teams ?? []) {
    if (teams.has(t.id)) continue;
    teams.set(t.id, {
      type: 'team',
      id: t.id,
      label: t.name,
      sub: t.shortName,
      href: `/teams/${t.id}`,
      logo: t.logo,
      hay: `${t.name} ${t.shortName}`.toLowerCase(),
    });
  }

  const players: SearchEntity[] = (index?.players ?? []).map((p) => ({
    type: 'player',
    id: p.id,
    label: p.name,
    sub: p.country,
    href: `/players/${p.id}`,
    hay: `${p.name} ${p.country}`.toLowerCase(),
  }));

  return [...out, ...teams.values(), ...players, ...series.values(), ...venues.values()];
}

const STATUS_RANK: Record<Match['status'], number> = { LIVE: 0, UPCOMING: 1, COMPLETED: 2 };

export function querySearch(entities: SearchEntity[], query: string, perGroup = 5): SearchEntity[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];

  const scored = entities
    .filter((e) => terms.every((t) => e.hay.includes(t)))
    .map((e) => {
      const label = e.label.toLowerCase();
      let score = 0;
      if (label === terms.join(' ')) score -= 4;
      else if (label.startsWith(terms[0])) score -= 3;
      else if (label.split(/\s+/).some((w) => w.startsWith(terms[0]))) score -= 2;
      if (e.status) score += STATUS_RANK[e.status] * 0.5;
      return { e, score };
    })
    // On a tie the plainer name first: "Pakistan" before "Pakistan U19 Women".
    .sort((a, b) => a.score - b.score || a.e.label.length - b.e.label.length);

  const counts = new Map<EntityType, number>();
  const out: SearchEntity[] = [];
  for (const { e } of scored) {
    const n = counts.get(e.type) ?? 0;
    if (n >= perGroup) continue;
    counts.set(e.type, n + 1);
    out.push(e);
  }
  return out;
}

export interface RecentSearch {
  label: string;
  href: string;
  type: EntityType | 'query';
}

export const recentSearchStore = createPersisted<RecentSearch[]>('pc.recentSearches', [], (raw) =>
  Array.isArray(raw) ? (raw as RecentSearch[]).filter((r) => r && typeof r.href === 'string') : null
);

export function rememberSearch(item: RecentSearch) {
  recentSearchStore.set((prev) => [item, ...prev.filter((r) => r.href !== item.href)].slice(0, 6));
}
