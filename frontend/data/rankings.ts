// Bundled snapshot of the ICC player rankings — the fallback, not the source.
//
// Live rankings come from crex via the Worker's /rankings/players route (see
// lib/rankings.ts). This file only renders when that is unreachable, and when it
// does the page caption says "as of <date>" so the staleness is visible rather
// than silent. Worth refreshing occasionally, along with `asOf` in the JSON, so
// the floor does not drift too far from reality — but nothing breaks if it does.
//
// It briefly served a second purpose: rankings lived in Cloudflare KV for a
// while, seeded from this same JSON, back when crex's rankings endpoint looked
// unreachable. It wasn't — see the Worker's README.
//
// NOTE: the ICC does not publish Women's Test rankings (women play almost no
// Tests), so that combination is intentionally absent.

import type { RankingFormat, RankingGender, RankingRole } from '@/types';
import payload from './rankings.json';

/** One row as stored. `position` is implied by array order, so it isn't held. */
export interface RankRow {
  playerName: string;
  country: string;
  rating: number;
}

/**
 * Shape of this file. Every level is partial: the
 * ICC publishes no Women's Test rankings, and a hand-edited payload may
 * legitimately omit a category rather than carry a stale one.
 */
export interface RankingsPayload {
  /** Publication date per gender, surfaced in the page caption. */
  asOf: Partial<Record<Lowercase<RankingGender>, string>>;
  rankings: Partial<
    Record<RankingFormat, Partial<Record<RankingGender, Partial<Record<RankingRole, RankRow[]>>>>>
  >;
}

export const FALLBACK_RANKINGS = payload as RankingsPayload;
