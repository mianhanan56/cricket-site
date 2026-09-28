import type { FallOfWicket, InningsScore, MatchEvent, OverSummary } from '@/types';
import type { PulseBall } from './pulse';
import { DEFAULT_BALLS_PER_OVER, ballsFrom } from './overs';

// Every point on the worm is a score the feed actually reported — the start, a
// fall of wicket, the end of an over, or the score now. Nothing is interpolated.

export interface WormPoint {
  balls: number;
  runs: number;
  source: 'start' | 'wicket' | 'over' | 'now';
}

export interface OverBar {
  over: number;
  runs: number;
  wickets: number;
  sixes: number | null;
  fours: number | null;
}

export interface InningsWorm {
  index: number;
  teamShortName: string;
  runs: number;
  wickets: number;
  balls: number;
  points: WormPoint[];
  fall: FallOfWicket[];
  bars: OverBar[];
  current: boolean;
}

function scoreRuns(score: string | null): number | null {
  const m = score ? /^(\d+)/.exec(score) : null;
  return m ? Number(m[1]) : null;
}

export function inningsWorms(
  innings: InningsScore[],
  overs: OverSummary[],
  balls: PulseBall[],
  perOver: number = DEFAULT_BALLS_PER_OVER
): InningsWorm[] {
  return innings
    .filter((inn) => !inn.notStarted)
    .map((inn, index) => {
      const byBalls = new Map<number, WormPoint>();
      byBalls.set(0, { balls: 0, runs: 0, source: 'start' });

      for (const w of inn.fallOfWickets ?? []) {
        const at = ballsFrom(w.overs, perOver);
        if (!byBalls.has(at)) byBalls.set(at, { balls: at, runs: w.runs, source: 'wicket' });
      }

      // The feed can repeat an over's summary row; the newest one wins.
      const byOver = new Map<number, OverSummary>();
      for (const o of overs) {
        if (o.inning !== index) continue;
        const seen = byOver.get(o.over);
        if (!seen || Number(o.id) > Number(seen.id)) byOver.set(o.over, o);
      }
      const own = [...byOver.values()];
      for (const o of own) {
        const runs = scoreRuns(o.score);
        if (runs === null) continue;
        byBalls.set(o.over * perOver, { balls: o.over * perOver, runs, source: 'over' });
      }

      const total = ballsFrom(inn.overs, perOver);
      byBalls.set(total, { balls: total, runs: inn.runs, source: 'now' });

      const points = [...byBalls.values()]
        .filter((p) => p.balls <= total)
        .sort((a, b) => a.balls - b.balls);

      const ownBalls = balls.filter((b) => b.inning === index);
      const bars: OverBar[] = own
        .map((o) => {
          const inOver = ownBalls.filter((b) => b.over + 1 === o.over);
          // Boundary counts only when every delivery of the over is on hand.
          const complete = inOver.filter((b) => b.extra !== 'wide' && b.extra !== 'noball').length >= perOver;
          return {
            over: o.over,
            runs: o.runs,
            wickets: o.wickets,
            sixes: complete ? inOver.filter((b) => b.batRuns === 6).length : null,
            fours: complete ? inOver.filter((b) => b.batRuns === 4).length : null,
          };
        })
        .sort((a, b) => a.over - b.over);

      return {
        index,
        teamShortName: inn.teamShortName,
        runs: inn.runs,
        wickets: inn.wickets,
        balls: total,
        points,
        fall: inn.fallOfWickets ?? [],
        bars,
        current: inn.phase === 'CURRENT',
      };
    });
}

/** Non-delivery moments worth pinning to the over axis. */
export function axisMoments(events: MatchEvent[]): MatchEvent[] {
  return events.filter(
    (e) =>
      e.over !== null &&
      e.over !== undefined &&
      (e.kind === 'MILESTONE' || e.kind === 'REVIEW' || e.kind === 'INNINGS_END')
  );
}
