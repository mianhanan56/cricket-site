'use client';

import type { Match, Team } from '@/types';
import { createPersisted, isRecord } from './persisted';

export type FollowedTeam = Pick<Team, 'id' | 'name' | 'shortName' | 'logo'>;

export interface FollowedEntity {
  id: string;
  name: string;
}

export interface Follows {
  teams: FollowedTeam[];
  players: FollowedEntity[];
  series: FollowedEntity[];
}

export type FollowKind = keyof Follows;

const EMPTY: Follows = { teams: [], players: [], series: [] };

const list = <T>(v: unknown): T[] =>
  Array.isArray(v) ? (v.filter((x) => isRecord(x) && typeof x.id === 'string') as T[]) : [];

export const followsStore = createPersisted<Follows>('pc.follows', EMPTY, (raw) =>
  isRecord(raw)
    ? { teams: list(raw.teams), players: list(raw.players), series: list(raw.series) }
    : null
);

export const useFollows = followsStore.use;

export function isFollowing(follows: Follows, kind: FollowKind, id: string): boolean {
  return follows[kind].some((e) => e.id === id);
}

export function toggleFollow(kind: 'teams', entity: FollowedTeam): void;
export function toggleFollow(kind: 'players' | 'series', entity: FollowedEntity): void;
export function toggleFollow(kind: FollowKind, entity: FollowedTeam | FollowedEntity): void {
  followsStore.set((prev) => {
    const current = prev[kind] as Array<FollowedTeam | FollowedEntity>;
    const next = current.some((e) => e.id === entity.id)
      ? current.filter((e) => e.id !== entity.id)
      : [...current, entity];
    return { ...prev, [kind]: next };
  });
}

export const followCount = (f: Follows): number =>
  f.teams.length + f.players.length + f.series.length;

/** A match involving a followed team or belonging to a followed series. */
export function isFollowedMatch(follows: Follows, m: Match): boolean {
  return (
    follows.teams.some((t) => t.id === m.homeTeam.id || t.id === m.awayTeam.id) ||
    follows.series.some((s) => s.id === m.series.id)
  );
}
