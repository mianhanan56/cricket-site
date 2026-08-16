/**
 * Over notation.
 *
 * An "over" is not a decimal: 4.3 is four overs and three balls. How many balls
 * make one is a property of the competition — six everywhere except The Hundred,
 * which crex scores in sets of five. Every rate, limit and label that touches a
 * ball count has to go through here with the match's own `ballsPerOver`.
 */

import type { InningsScore, Match, MatchFormat } from '@/types';

export const DEFAULT_BALLS_PER_OVER = 6;

/** The Hundred's five-ball sets. Used to spot it, since it alone counts in balls. */
export const HUNDRED_BALLS_PER_OVER = 5;

/** 36.3 -> 219 balls at six per over. Never `overs * perOver` — see above. */
export function ballsFrom(overs: number, perOver: number = DEFAULT_BALLS_PER_OVER): number {
  const whole = Math.floor(overs);
  return whole * perOver + Math.round((overs - whole) * 10);
}

/** 27 balls -> 4.3. The inverse of `ballsFrom`. */
export function oversFrom(balls: number, perOver: number = DEFAULT_BALLS_PER_OVER): number {
  return Math.floor(balls / perOver) + (balls % perOver) / 10;
}

/**
 * How far an innings has got, as the competition itself would put it.
 *
 * The Hundred does not number overs — its innings is 100 balls and the scoreboard
 * counts down in balls, so "11.1 overs" there is both unfamiliar and misread as
 * eleven six-ball overs. Everything else reads in overs as usual.
 */
export function formatProgress(
  overs: number,
  perOver: number = DEFAULT_BALLS_PER_OVER
): string {
  if (perOver === HUNDRED_BALLS_PER_OVER) {
    const balls = ballsFrom(overs, perOver);
    return `${balls} ${balls === 1 ? 'ball' : 'balls'}`;
  }
  return `${overs} ${overs === 1 ? 'over' : 'overs'}`;
}

/** The same reading, abbreviated for tight spots: "(36.3 ov)" / "(56 balls)". */
export function formatProgressShort(
  overs: number,
  perOver: number = DEFAULT_BALLS_PER_OVER
): string {
  if (perOver === HUNDRED_BALLS_PER_OVER) return `${ballsFrom(overs, perOver)} balls`;
  return `${overs} ov`;
}

// ------------------------------------------------------------- Innings length

/** Scheduled overs per side. Test cricket has none, which is what null means. */
export const SCHEDULED_OVERS: Record<MatchFormat, number | null> = {
  T20: 20, // also The Hundred — 20 five-ball overs, via ballsPerOver
  ODI: 50,
  TEST: null,
};

/**
 * How many balls the chasing side gets, given the innings it is chasing.
 *
 * The feed carries no innings limit, and the format's own is wrong for every
 * rain-shortened game (crex is listing 18- and 19-over T20s right now). So it is
 * read off the first innings instead: a side that was not bowled out batted
 * exactly its allocation, and a limited-overs innings only ends mid-over when
 * the batting side is out — so the ball count is the allocation, exactly.
 *
 * Being bowled out says nothing about the limit, and there the format's own
 * figure is the best available guess. Null means the format sets no limit (Test).
 */
export function inningsBallLimit(
  first: InningsScore,
  match: Match,
  perOver: number = DEFAULT_BALLS_PER_OVER
): number | null {
  // The Hundred fixes the innings in balls, so no derivation is needed or wanted.
  if (match.ballsLimit) return match.ballsLimit;

  const scheduled = SCHEDULED_OVERS[match.format];
  if (scheduled === null) return null;

  const full = scheduled * perOver;
  if (first.wickets >= 10) return full;

  const bowled = ballsFrom(first.overs, perOver);
  // Never above the scheduled figure: a miscounted feed should not invent balls
  // the chase does not have.
  return bowled > 0 ? Math.min(bowled, full) : full;
}
