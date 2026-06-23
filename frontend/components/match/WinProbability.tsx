'use client';

import type { Match } from '@crex/shared';
import styles from './WinProbability.module.scss';

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function maxOvers(format: string): number {
  if (format === 'T20') return 20;
  if (format === 'ODI') return 50;
  return 90; // TEST (rough cap for projection)
}

/**
 * Basic, math-only win probability (no ML).
 * Uses run-rate comparison, wickets in hand, and target/overs remaining.
 */
function compute(match: Match): { homePct: number; awayPct: number } | null {
  const sc = match.scorecard;
  const inn = sc?.innings?.[sc?.currentInnings ?? 0];
  if (!inn) return null;

  const overs = inn.overs ?? 0;
  const ballsBowled = Math.floor(overs) * 6 + Math.round((overs % 1) * 10);
  const crr = ballsBowled ? inn.runs / (ballsBowled / 6) : 0;
  const wktsInHand = Math.max(0, 10 - inn.wickets);
  const total = maxOvers(match.format);

  let battingPct: number;

  if (sc?.target) {
    const need = sc.target - inn.runs;
    const ballsLeft = total * 6 - ballsBowled;
    if (need <= 0) battingPct = 99;
    else if (ballsLeft <= 0) battingPct = 1;
    else {
      const rrr = need / (ballsLeft / 6);
      const rate = clamp(50 + (crr - rrr) * 8, 5, 95);
      const wf = wktsInHand / 10;
      battingPct = clamp(rate * wf + 20 * (1 - wf), 3, 97);
    }
  } else {
    // First innings — project the score and compare to a par total.
    const projected = crr * total;
    const par = match.format === 'T20' ? 170 : match.format === 'ODI' ? 280 : 350;
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
