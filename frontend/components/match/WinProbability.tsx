'use client';

import type { InningsScore, Match } from '@/types';
import {
  DEFAULT_BALLS_PER_OVER,
  SCHEDULED_OVERS,
  ballsFrom,
  inningsBallLimit,
} from '@/lib/overs';
import styles from './WinProbability.module.scss';

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** A day's play, as the rough innings length a Test projection is scaled against. */
const TEST_PROJECTION_OVERS = 90;

/**
 * Balls in the innings being batted. The Hundred carries its own limit (100) —
 * taking the format's 20 overs at six a piece would hand a chase 20 balls it does
 * not have, and flatter every required rate accordingly.
 */
function inningsBalls(match: Match, perOver: number): number {
  if (match.ballsLimit) return match.ballsLimit;
  return (SCHEDULED_OVERS[match.format] ?? TEST_PROJECTION_OVERS) * perOver;
}

/** A par first-innings score, per ball: 170 off a T20, 280 off an ODI, 350 in a day. */
const PAR_PER_BALL: Record<Match['format'], number> = {
  T20: 170 / 120,
  ODI: 280 / 300,
  TEST: 350 / 540,
};

/**
 * Basic, math-only win probability (no ML).
 * Uses run-rate comparison, wickets in hand, and target/overs remaining.
 *
 * The innings in progress is the *last* one that has batted, and a chase is the
 * second of them — both read off the card rather than from `scorecard.target` and
 * `currentInnings`, which no source ever populated. Reading those meant this
 * always scored the first innings as if it were live, so a chase was rated on
 * the total being chased instead of the pursuit of it.
 *
 * Which is also why `innings` is passed in rather than taken from
 * `match.scorecard`: only the scorecard endpoint returns innings in *innings*
 * order. The match list carries the two totals in team order, and reading a
 * chase off that gets the target backwards whenever the away side batted first.
 */
function compute(
  match: Match,
  innings: InningsScore[]
): { homePct: number; awayPct: number } | null {
  const batted = innings.filter((i) => !i.notStarted);
  const inn = batted[batted.length - 1];
  if (!inn) return null;

  const perOver = match.ballsPerOver || DEFAULT_BALLS_PER_OVER;
  const ballsBowled = ballsFrom(inn.overs ?? 0, perOver);
  const crr = ballsBowled ? inn.runs / (ballsBowled / perOver) : 0;
  const wktsInHand = Math.max(0, 10 - inn.wickets);

  // A chase needs a completed innings to chase and a limit to do it in, so this
  // is the second innings of a limited-overs match and nothing else.
  const chaseLimit = batted.length === 2 ? inningsBallLimit(batted[0], match, perOver) : null;

  let battingPct: number;

  if (chaseLimit !== null) {
    const need = batted[0].runs + 1 - inn.runs;
    const ballsLeft = chaseLimit - ballsBowled;
    if (need <= 0) battingPct = 99;
    else if (ballsLeft <= 0) battingPct = 1;
    else {
      const rrr = need / (ballsLeft / perOver);
      const rate = clamp(50 + (crr - rrr) * 8, 5, 95);
      const wf = wktsInHand / 10;
      battingPct = clamp(rate * wf + 20 * (1 - wf), 3, 97);
    }
  } else {
    // First innings — project the score and compare to a par total. Par is held
    // as a rate per ball rather than a flat score so it follows the innings
    // length: The Hundred's 100 balls are not worth a 120-ball T20 par.
    const totalBalls = inningsBalls(match, perOver);
    const projected = crr * (totalBalls / perOver);
    const par = PAR_PER_BALL[match.format] * totalBalls;
    const scoreFactor = clamp(50 + ((projected - par) / par) * 60, 20, 80);
    battingPct = clamp(scoreFactor * 0.7 + (wktsInHand / 10) * 30, 15, 85);
  }

  // Map the batting-team probability onto home/away. crex resolves no team id on
  // an innings, so the short name is what the two are matched on.
  const battingIsHome =
    inn.teamId !== undefined
      ? inn.teamId === match.homeTeam.id
      : inn.teamShortName === match.homeTeam.shortName;
  const homePct = Math.round(battingIsHome ? battingPct : 100 - battingPct);
  return { homePct, awayPct: 100 - homePct };
}

export default function WinProbability({
  match,
  innings,
}: {
  match: Match;
  /** The fetched scorecard, in innings order. Nothing is drawn until it lands. */
  innings: InningsScore[];
}) {
  const wp = compute(match, innings);
  if (!wp) return null;

  return (
    <div className={styles.widget}>
      <div className={styles.head}>
        <span className={styles.title}>Win Probability</span>
      </div>
      <div className={styles.bar} role="img" aria-label={`Win probability ${match.homeTeam.shortName} ${wp.homePct}% vs ${match.awayTeam.shortName} ${wp.awayPct}%`}>
        <span className={styles.home} style={{ width: `${wp.homePct}%` }} />
        <span className={styles.away} style={{ width: `${wp.awayPct}%` }} />
      </div>
      <div className={styles.labels}>
        <span className={styles.homeLabel}>
          {match.homeTeam.shortName} <strong>{wp.homePct}%</strong>
        </span>
        <span className={styles.awayLabel}>
          <strong>{wp.awayPct}%</strong> {match.awayTeam.shortName}
        </span>
      </div>
    </div>
  );
}
