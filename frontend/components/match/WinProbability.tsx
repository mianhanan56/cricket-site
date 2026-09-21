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
 *
 * Known gap, and deliberately not guessed at: a rain-shortened *first* innings
 * still projects to the format's length, because nothing in the feed says it was
 * cut and there is no earlier innings to read the allocation off. It corrects
 * itself at the chase, which goes through `inningsBallLimit`.
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
/**
 * Sessions of play left, from the day crex reports.
 *
 * Three a day, and the day in progress counted as half — crex publishes the day
 * but not the session or the overs left in it, so the fraction is deliberately
 * coarse rather than a made-up over count. It only ever scales a draw weight,
 * and nothing in the UI prints it as a fact.
 */
function sessionsLeft(day: number | null | undefined): number {
  const played = Math.min(Math.max(day ?? 1, 1), TEST_DAYS);
  return (TEST_DAYS - played) * SESSIONS_PER_DAY + SESSIONS_PER_DAY / 2;
}

/** A Test is five days of three sessions. */
const TEST_DAYS = 5;
const SESSIONS_PER_DAY = 3;

/**
 * A Test's three-way split.
 *
 * The draw is not a residual of two win chances — it is the outcome most Tests
 * that reach a fifth afternoon actually have, and modelling it as "whatever is
 * left over" gets a dead-drawn match rated as a 50/50 win. So it is weighted
 * first, from the time left and how many innings are still to come, and the two
 * win chances split what remains.
 *
 * Deliberately coarse, and ours rather than crex's: their number comes from a
 * model that is not in any payload we read. What this is good for is the shape
 * of the match — a side 300 behind on day three is not favourite, and a fourth
 * innings needing 40 with nine standing very much is.
 */
function testSplit(
  match: Match,
  batted: InningsScore[]
): { battingPct: number; drawPct: number } {
  const current = batted[batted.length - 1];
  const sessions = sessionsLeft(match.day);
  const wktsInHand = Math.max(0, 10 - current.wickets);

  // Runs the side batting is behind by, across every innings each has batted.
  const ownRuns = batted
    .filter((i) => i.teamId === current.teamId)
    .reduce((sum, i) => sum + i.runs, 0);
  const theirRuns = batted
    .filter((i) => i.teamId !== current.teamId)
    .reduce((sum, i) => sum + i.runs, 0);
  const deficit = theirRuns - ownRuns;

  // A fourth innings is a chase against the clock: few runs and many wickets is
  // a win, many runs and few sessions is a draw, and no wickets is a loss.
  const fourth = batted.length === 4;

  if (fourth && deficit >= 0) {
    const need = deficit + 1;
    // Roughly 30 overs a session at three runs an over — the rate a side chasing
    // in a Test actually scores at, not a limited-overs rate.
    const gettable = sessions * 90;
    const room = clamp(1 - need / Math.max(gettable, 1), 0, 1);
    const wf = wktsInHand / 10;

    return {
      battingPct: clamp(room * 75 * wf + 5, 2, 95),
      // Wickets in hand is what keeps a draw alive: nine down with a session to
      // go is a loss, not a stalemate.
      drawPct: clamp((1 - room) * 70 * wf, 3, 90),
    };
  }

  // Earlier innings. Two forces, and both are needed: time makes a draw likelier
  // (a first innings still going on day four is going nowhere), and one-sidedness
  // makes it less likely (300 behind with three wickets standing is a defeat, not
  // a stalemate). Weighting time alone rated a Test that was all but lost as an
  // even-money draw.
  const timeDraw = clamp(90 - sessions * 6, 20, 85);
  const dominance = clamp(Math.abs(deficit) / 300, 0, 1);
  const wicketsGone = current.wickets / 10;
  const decisive = clamp(dominance * (0.4 + 0.6 * wicketsGone), 0, 0.85);

  const drawPct = timeDraw * (1 - decisive);
  const edge = clamp(50 - (deficit / 250) * 45, 8, 92);

  return { battingPct: (edge / 100) * (100 - drawPct), drawPct };
}

function compute(
  match: Match,
  innings: InningsScore[]
): { homePct: number; awayPct: number; drawPct: number } | null {
  const batted = innings.filter((i) => !i.notStarted);
  const inn = batted[batted.length - 1];
  if (!inn) return null;

  const perOver = match.ballsPerOver || DEFAULT_BALLS_PER_OVER;
  const ballsBowled = ballsFrom(inn.overs ?? 0, perOver);
  const crr = ballsBowled ? inn.runs / (ballsBowled / perOver) : 0;
  const wktsInHand = Math.max(0, 10 - inn.wickets);

  // A Test has three results, and the third is the common one. Split separately
  // — see `testSplit`.
  if (match.format === 'TEST') {
    const split = testSplit(match, batted);
    // The two win chances share whatever the draw leaves, so the three always
    // add to a hundred however the weights above were clamped.
    const drawPct = Math.round(clamp(split.drawPct, 0, 90));
    const rest = 100 - drawPct;
    const batting = Math.round(clamp(split.battingPct, 0, rest));
    const homePct = isHome(inn, match) ? batting : rest - batting;

    return { homePct, drawPct, awayPct: rest - homePct };
  }

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

  const homePct = Math.round(isHome(inn, match) ? battingPct : 100 - battingPct);
  return { homePct, awayPct: 100 - homePct, drawPct: 0 };
}

/**
 * Whether the side batting is the home side. crex resolves no team id on some
 * sources, so the short name is the fallback — the same pairing the header's own
 * scores are matched on.
 */
function isHome(inn: InningsScore, match: Match): boolean {
  return inn.teamId !== undefined
    ? inn.teamId === match.homeTeam.id
    : inn.teamShortName === match.homeTeam.shortName;
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
      <div
        className={styles.bar}
        role="img"
        aria-label={
          `Win probability ${match.homeTeam.shortName} ${wp.homePct}%` +
          (wp.drawPct ? `, draw ${wp.drawPct}%` : '') +
          `, ${match.awayTeam.shortName} ${wp.awayPct}%`
        }
      >
        <span className={styles.home} style={{ width: `${wp.homePct}%` }} />
        {wp.drawPct > 0 && (
          <span className={styles.draw} style={{ width: `${wp.drawPct}%` }} />
        )}
        <span className={styles.away} style={{ width: `${wp.awayPct}%` }} />
      </div>
      <div className={styles.labels}>
        <span className={styles.homeLabel}>
          {match.homeTeam.shortName} <strong>{wp.homePct}%</strong>
        </span>
        {wp.drawPct > 0 && (
          <span className={styles.drawLabel}>
            Draw <strong>{wp.drawPct}%</strong>
          </span>
        )}
        <span className={styles.awayLabel}>
          <strong>{wp.awayPct}%</strong> {match.awayTeam.shortName}
        </span>
      </div>
    </div>
  );
}
