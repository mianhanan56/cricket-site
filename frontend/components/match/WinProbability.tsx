'use client';

import type { Match } from '@/types';
import { DEFAULT_BALLS_PER_OVER, ballsFrom } from '@/lib/overs';
import styles from './WinProbability.module.scss';

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/**
 * Balls in an innings. The Hundred carries its own limit (100) — taking the
 * format's 20 overs at six a piece would hand a chase 20 balls it does not have,
 * and flatter every required rate accordingly.
 */
function inningsBalls(match: Match, perOver: number): number {
  if (match.ballsLimit) return match.ballsLimit;
  if (match.format === 'T20') return 20 * perOver;
  if (match.format === 'ODI') return 50 * perOver;
  return 90 * perOver; // TEST (rough cap for projection)
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
 */
function compute(match: Match): { homePct: number; awayPct: number } | null {
  const sc = match.scorecard;
  const inn = sc?.innings?.[sc?.currentInnings ?? 0];
  if (!inn) return null;

  const perOver = match.ballsPerOver || DEFAULT_BALLS_PER_OVER;
  const ballsBowled = ballsFrom(inn.overs ?? 0, perOver);
  const crr = ballsBowled ? inn.runs / (ballsBowled / perOver) : 0;
  const wktsInHand = Math.max(0, 10 - inn.wickets);
  const totalBalls = inningsBalls(match, perOver);

  let battingPct: number;

  if (sc?.target) {
    const need = sc.target - inn.runs;
    const ballsLeft = totalBalls - ballsBowled;
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
    const projected = crr * (totalBalls / perOver);
    const par = PAR_PER_BALL[match.format] * totalBalls;
    const scoreFactor = clamp(50 + ((projected - par) / par) * 60, 20, 80);
    battingPct = clamp(scoreFactor * 0.7 + (wktsInHand / 10) * 30, 15, 85);
  }

  // Map the batting-team probability onto home/away.
  const battingIsHome = inn.teamId === match.homeTeam.id;
  const homePct = Math.round(battingIsHome ? battingPct : 100 - battingPct);
  return { homePct, awayPct: 100 - homePct };
}

export default function WinProbability({ match }: { match: Match }) {
  const wp = compute(match);
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
