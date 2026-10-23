// Numeric codes shared by the schedule-shaped rows: /series/matches, /fixtures and /team/matches.
import type { MatchFormat, MatchStatus } from '@/types';
import { DEFAULT_BALLS_PER_OVER, HUNDRED_BALLS_PER_OVER } from '../overs';

/** An innings of The Hundred, in balls. */
export const HUNDRED_BALLS = 100;

/** `ft` for The Hundred — the only signal a schedule row gives for it. */
const HUNDRED_FORMAT = 5;

// Not the feed's `n` vocabulary.
const SERIES_MATCH_STATUS: Record<number, MatchStatus> = {
  0: 'UPCOMING',
  1: 'LIVE',
  2: 'COMPLETED',
};

// The Hundred folds into T20, as in toMatchFormat.
const SERIES_MATCH_FORMAT: Record<number, MatchFormat> = {
  1: 'ODI',
  2: 'T20',
  3: 'TEST',
  4: 'T10',
  5: 'T20',
};

export const scheduleStatus = (s: number | undefined): MatchStatus => SERIES_MATCH_STATUS[s ?? 0] ?? 'UPCOMING';

export const scheduleFormat = (ft: number | undefined, fallback: MatchFormat = 'T20'): MatchFormat =>
  SERIES_MATCH_FORMAT[ft ?? 0] ?? fallback;

/** Balls per over and the innings' ball limit for a row's `ft`: The Hundred is 100 balls in fives. */
export function scheduleBalls(ft: number | undefined): { ballsPerOver: number; ballsLimit: number | null } {
  return ft === HUNDRED_FORMAT
    ? { ballsPerOver: HUNDRED_BALLS_PER_OVER, ballsLimit: HUNDRED_BALLS }
    : { ballsPerOver: DEFAULT_BALLS_PER_OVER, ballsLimit: null };
}
