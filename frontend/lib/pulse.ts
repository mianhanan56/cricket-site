import type { BallExtra, MatchFormat } from '@/types';
import { runsLabel } from './balls';

/** The fields of a delivery the pulse reads. */
export interface PulseBall {
  id: string;
  over: number;
  ball: number;
  runs: number;
  batRuns: number;
  extra: BallExtra | null;
  isWicket: boolean;
  inning?: number;
}

export type PulseKey = 'momentum' | 'pressure' | 'boundaries' | 'wickets';

export interface PulseReading {
  key: PulseKey;
  label: string;
  /** 0..1, for the meter. */
  value: number;
  /** The figure the meter was built from, printed beside it. */
  figure: string;
}

const PULSE_WINDOW = 18;
const MIN_BALLS = 6;

// Runs per over treated as a full meter, per format.
const MOMENTUM_CEILING: Record<MatchFormat, number> = { T10: 16, T20: 14, ODI: 10, TEST: 6 };

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const isLegal = (b: PulseBall) => b.extra !== 'wide' && b.extra !== 'noball';

/** Legal deliveries in a window — what "Last N balls" and every meter's denominator count. */
export const legalBalls = (window: PulseBall[]): number => window.filter(isLegal).length;

/** The newest `limit` legal deliveries of the innings in progress, with the extras among them, oldest first. */
export function recentInningsBalls<T extends PulseBall>(newestFirst: T[], limit = PULSE_WINDOW): T[] {
  if (!newestFirst.length) return [];
  const inning = newestFirst[0].inning;
  const out: T[] = [];
  let legal = 0;
  for (const b of newestFirst) {
    if (b.inning !== inning) break;
    out.push(b);
    if (isLegal(b) && ++legal >= limit) break;
  }
  return out.reverse();
}

export function matchPulse(
  window: PulseBall[],
  format: MatchFormat,
  perOver: number
): PulseReading[] | null {
  const legal = window.filter(isLegal);
  if (legal.length < MIN_BALLS) return null;

  const runs = window.reduce((sum, b) => sum + b.runs, 0);
  const rpo = (runs / legal.length) * perOver;
  const dots = legal.filter((b) => b.runs === 0).length;
  const boundaries = window.filter((b) => b.batRuns === 4 || b.batRuns === 6).length;
  const wickets = window.filter((b) => b.isWicket).length;
  const n = legal.length;

  return [
    {
      key: 'momentum',
      label: 'Batting momentum',
      value: clamp01(rpo / MOMENTUM_CEILING[format]),
      figure: `${rpo.toFixed(1)} rpo`,
    },
    {
      key: 'pressure',
      label: 'Bowling pressure',
      value: clamp01(dots / n),
      figure: `${Math.round((dots / n) * 100)}% dots`,
    },
    {
      key: 'boundaries',
      label: 'Boundary frequency',
      value: clamp01(boundaries / n / 0.3),
      figure: `${boundaries} in ${n}`,
    },
    {
      key: 'wickets',
      label: 'Wicket pressure',
      value: clamp01(wickets / 3),
      figure: `${wickets} wkt${wickets === 1 ? '' : 's'}`,
    },
  ];
}

/** One sample of the pulse trace: height in -1..1, where a wicket dips below the line. */
export interface TracePoint {
  id: string;
  level: number;
  kind: 'dot' | 'run' | 'four' | 'six' | 'wicket' | 'extra';
  /** "9.4" */
  at: string;
  /** "Wicket", "Four", "Wide + 1 run" */
  summary: string;
  /** "Bowler to Batter", when the feed carries the line. */
  detail?: string;
  score?: string;
}

type TraceBall = PulseBall & { text?: string; scoreAfter?: string | null };

function traceShape(b: PulseBall): Pick<TracePoint, 'level' | 'kind' | 'summary'> {
  if (b.isWicket) return { level: -0.85, kind: 'wicket', summary: 'Wicket' };
  if (b.batRuns === 6) return { level: 1, kind: 'six', summary: 'Six' };
  if (b.batRuns === 4) return { level: 0.72, kind: 'four', summary: 'Four' };
  if (b.extra) return { level: 0.22, kind: 'extra', summary: runsLabel(b) };
  if (b.runs === 0) return { level: 0, kind: 'dot', summary: 'Dot ball' };
  return { level: Math.min(0.12 + b.runs * 0.1, 0.45), kind: 'run', summary: runsLabel(b) };
}

export function pulseTrace(window: TraceBall[]): TracePoint[] {
  return window.map((b) => ({
    id: b.id,
    at: `${b.over}.${b.ball}`,
    detail: b.text?.split('—')[0].trim() || undefined,
    score: b.scoreAfter ?? undefined,
    ...traceShape(b),
  }));
}
