import type { CommentaryBall, FallOfWicket } from '@/types';
import { dedupeDeliveries, isIllegal } from './balls';

export type BallRole = 'batter' | 'bowler';

export interface PlayerOver {
  over: number;
  balls: CommentaryBall[];
  /** Off the bat for a batter; conceded (byes and leg byes excluded) for a bowler. */
  runs: number;
  wickets: number;
  /** The other end: bowlers a batter faced, batters a bowler bowled to. */
  opponents: string[];
}

// Within an over, the feed id (epoch ms) orders a wide before the ball re-bowled under its number.
const chronological = (a: CommentaryBall, b: CommentaryBall) =>
  (a.inning ?? 0) - (b.inning ?? 0) || a.over - b.over || Number(a.id) - Number(b.id);

/** A batter faces every delivery but a wide; a bowler's count is legal deliveries only. */
export function countsToward(b: CommentaryBall, role: BallRole): boolean {
  return role === 'batter' ? b.extra !== 'wide' : !isIllegal(b);
}

/**
 * One player's deliveries in one innings, oldest first.
 *
 * A wicket on the striker's ball is not always the striker's — the non-striker
 * can be run out off it — so a batter keeps the W only on the ball that matches
 * their own fall of wicket.
 */
export function playerBalls(
  all: CommentaryBall[],
  inning: number,
  playerId: string,
  role: BallRole,
  fallOfWickets: FallOfWicket[] = []
): CommentaryBall[] {
  const mine = dedupeDeliveries(
    all.filter((b) => (b.inning ?? 0) === inning && (role === 'batter' ? b.batterId : b.bowlerId) === playerId)
  ).sort(chronological);
  if (role === 'bowler') return mine;

  const fow = fallOfWickets.find((w) => w.playerId === playerId);
  const outScore = fow ? `${fow.runs}/${fow.wicket}` : null;
  const last = mine[mine.length - 1];
  return mine.map((b) => {
    if (!b.isWicket) return b;
    const theirs = b.scoreAfter ? b.scoreAfter === outScore : fow !== undefined && b === last;
    return theirs ? b : { ...b, isWicket: false };
  });
}

export function countedBalls(balls: CommentaryBall[], role: BallRole): number {
  return balls.filter((b) => countsToward(b, role)).length;
}

export function oversOf(balls: CommentaryBall[], role: BallRole): PlayerOver[] {
  const groups: PlayerOver[] = [];
  for (const b of balls) {
    let g = groups[groups.length - 1];
    if (!g || g.over !== b.over) {
      g = { over: b.over, balls: [], runs: 0, wickets: 0, opponents: [] };
      groups.push(g);
    }
    g.balls.push(b);
    const byes = b.extra === 'bye' || b.extra === 'legbye' ? b.extraRuns : 0;
    g.runs += role === 'batter' ? b.batRuns : b.runs - byes;
    if (b.isWicket) g.wickets += 1;
    const other = role === 'batter' ? b.bowlerId : b.batterId;
    if (other && !g.opponents.includes(other)) g.opponents.push(other);
  }
  return groups;
}
