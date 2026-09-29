import type { BallExtra, CommentaryBall, InningsScore } from '@/types';
import { HUNDRED_BALLS_PER_OVER, ballsFrom } from './overs';

/**
 * A delivery as the UI renders it — the feed's ball minus fields nothing reads.
 * `timestamp` dates the last ball, which is how a stale stoppage is spotted.
 */
export type BallEntry = Pick<
  CommentaryBall,
  | 'id'
  | 'over'
  | 'ball'
  | 'runs'
  | 'batRuns'
  | 'extraRuns'
  | 'extra'
  | 'isWicket'
  | 'text'
  | 'scoreAfter'
  | 'inning'
  | 'timestamp'
>;

export const toBallEntry = ({
  id,
  over,
  ball,
  runs,
  batRuns,
  extraRuns,
  extra,
  isWicket,
  text,
  scoreAfter,
  inning,
  timestamp,
}: CommentaryBall): BallEntry => ({
  id,
  over,
  ball,
  runs,
  batRuns,
  extraRuns,
  extra,
  isWicket,
  text,
  scoreAfter,
  inning,
  timestamp,
});

export const EXTRA_LABELS: Record<BallExtra, { short: string; long: string }> = {
  wide: { short: 'wd', long: 'Wide' },
  noball: { short: 'nb', long: 'No Ball' },
  bye: { short: 'b', long: 'Bye' },
  legbye: { short: 'lb', long: 'Leg Bye' },
};

/** Wides and no balls cost a run before anything is run off them. */
export function isIllegal(b: Pick<BallEntry, 'extra'>): boolean {
  return b.extra === 'wide' || b.extra === 'noball';
}

function scoredOffExtra(b: Pick<BallEntry, 'runs'>): number {
  return Math.max(b.runs - 1, 0);
}

export type BallKind = 'wicket' | 'six' | 'four' | 'wide' | 'noball' | 'extra' | 'run' | 'dot';

// Boundaries are read off the bat, not the total: four wides is not a four.
export function ballKind(b: BallEntry): BallKind {
  if (b.isWicket) return 'wicket';
  if (b.batRuns === 6) return 'six';
  if (b.batRuns === 4) return 'four';
  if (b.extra === 'wide') return 'wide';
  if (b.extra === 'noball') return 'noball';
  if (b.extra) return 'extra';
  return b.runs ? 'run' : 'dot';
}

const plural = (runs: number) => (runs === 1 ? '1 run' : `${runs} runs`);

/** "W", "4", "wd", "wd+4", "1lb" — a delivery in a token's worth of characters. */
export function shortLabel(b: BallEntry): string {
  if (b.isWicket) return b.runs ? `W+${b.runs}` : 'W';
  if (isIllegal(b)) {
    const scored = scoredOffExtra(b);
    const token = EXTRA_LABELS[b.extra as BallExtra].short;
    return scored ? `${token}+${scored}` : token;
  }
  if (b.extra) return `${b.runs}${EXTRA_LABELS[b.extra].short}`;
  return String(b.runs);
}

/** "Wide + 1 run", "No Ball + 4 runs", "4 runs". */
export function runsLabel(b: Pick<BallEntry, 'runs' | 'extra' | 'isWicket'>): string {
  const parts: string[] = [];
  if (isIllegal(b)) {
    const scored = scoredOffExtra(b);
    parts.push(EXTRA_LABELS[b.extra as BallExtra].long);
    if (scored) parts.push(plural(scored));
  } else if (b.extra) {
    const word = EXTRA_LABELS[b.extra].long.toLowerCase();
    parts.push(`${b.runs} ${word}${b.runs === 1 ? '' : 's'}`);
  } else if (b.runs || !b.isWicket) {
    parts.push(plural(b.runs));
  }
  if (b.isWicket) parts.unshift('W');
  return parts.join(' + ');
}

export function ballTitle(b: BallEntry): string {
  return `${b.over}.${b.ball} — ${runsLabel(b)}`;
}

/** The last legal ball of an over reads as the next over's start: "66.0", never "65.6". */
/**
 * Deliveries the scorecard has caught up with. The card and the ball feed are
 * separate Worker cache entries and the card can trail by a few seconds, so
 * without this the last ball reads 46.0 over a score still at 45.5.
 */
export function reachedByCard<T extends Pick<BallEntry, 'over' | 'ball' | 'extra' | 'inning'>>(
  balls: T[],
  innings: InningsScore[],
  perOver: number
): T[] {
  const batted = innings.filter((i) => !i.notStarted);
  if (!batted.length) return balls;
  const current = batted.length - 1;
  const limit = ballsFrom(batted[current].overs, perOver);
  return balls.filter((b) => {
    const inn = b.inning ?? current;
    if (inn !== current) return inn < current;
    // A wide or no ball carries the number of the delivery still to come.
    return b.over * perOver + (isIllegal(b) ? b.ball - 1 : b.ball) <= limit;
  });
}

export function ballPosition(b: BallEntry, perOver: number): string {
  if (!isIllegal(b) && b.ball >= perOver) return `${b.over + 1}.0`;
  return `${b.over}.${b.ball}`;
}

/**
 * `over` counts completed overs, so deliveries 31.x belong to the 32nd over.
 * The Hundred has no overs; its groups are sets of five.
 */
export function overGroupLabel(over: number, perOver: number): string {
  return perOver === HUNDRED_BALLS_PER_OVER ? `Set ${over + 1}` : `Over ${over + 1}`;
}

export interface BallGroup {
  over: number;
  balls: BallEntry[];
  runs: number;
  /** The oldest group, cut off mid-over by the window. */
  truncated: boolean;
  /** Legal deliveries still to come in the over in progress. */
  pending: number;
}

/**
 * Deliveries grouped one over per row. Totals come from the full commentary
 * where possible, since the window usually clips its oldest over.
 */
export function groupBalls(
  window: BallEntry[],
  perOver: number,
  allBalls: BallEntry[] = window,
  showPending = true
): BallGroup[] {
  const runsByOver = new Map<string, number>();
  for (const b of allBalls) {
    const k = `${b.inning ?? 0}:${b.over}`;
    runsByOver.set(k, (runsByOver.get(k) ?? 0) + b.runs);
  }

  const groups: Array<{ over: number; inning: number; balls: BallEntry[] }> = [];
  for (const b of window) {
    const last = groups[groups.length - 1];
    if (last && last.over === b.over && last.inning === (b.inning ?? 0)) last.balls.push(b);
    else groups.push({ over: b.over, inning: b.inning ?? 0, balls: [b] });
  }

  return groups.map((g, i) => {
    const legal = g.balls.filter((b) => !isIllegal(b)).length;
    return {
      over: g.over,
      balls: g.balls,
      runs: runsByOver.get(`${g.inning}:${g.over}`) ?? g.balls.reduce((s, b) => s + b.runs, 0),
      truncated: i === 0 && g.balls[0].ball > 1,
      pending: showPending && i === groups.length - 1 && legal < perOver ? perOver - legal : 0,
    };
  });
}
