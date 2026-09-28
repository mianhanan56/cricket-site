import type { InningsScore, Match, Team } from '@/types';
import { DEFAULT_BALLS_PER_OVER, HUNDRED_BALLS_PER_OVER, ballsFrom, inningsBallLimit } from './overs';

export type MatchPhase = 'POWERPLAY' | 'MIDDLE' | 'DEATH';

export const PHASE_LABEL: Record<MatchPhase, string> = {
  POWERPLAY: 'Powerplay',
  MIDDLE: 'Middle overs',
  DEATH: 'Death overs',
};

export interface LiveEquation {
  innings: InningsScore;
  battingTeam: Team;
  bowlingTeam: Team;
  perOver: number;
  ballsBowled: number;
  crr: number | null;
  /** Second innings of a limited-overs match only. */
  target: number | null;
  need: number | null;
  ballsLeft: number | null;
  rrr: number | null;
  phase: MatchPhase | null;
}

/** Anything on the board yet — an innings opened at 0/0 in 0 overs has not started. */
export function inningsStarted(eq: LiveEquation | null | undefined): eq is LiveEquation {
  return Boolean(eq && (eq.ballsBowled > 0 || eq.innings.runs > 0 || eq.innings.wickets > 0));
}

/**
 * The innings being batted. Prefers the feed's own CURRENT marker; falls back to
 * the last batted innings, which is only right on a card in innings order.
 */
export function currentInnings(match: Match, innings?: InningsScore[]): InningsScore | null {
  if (match.status !== 'LIVE') return null;
  const list = (innings ?? match.scorecard?.innings ?? []).filter((i) => !i.notStarted);
  return list.find((i) => i.phase === 'CURRENT') ?? (innings ? list[list.length - 1] : null) ?? null;
}

// Fixed powerplay/death boundaries only hold on a full-length six-ball innings.
function phaseOf(match: Match, balls: number, limit: number | null, perOver: number): MatchPhase | null {
  if (perOver !== DEFAULT_BALLS_PER_OVER || match.ballsLimit) return null;
  const over = Math.floor(balls / perOver) + 1;
  if (match.format === 'T20' && (limit === null || limit === 120)) {
    return over <= 6 ? 'POWERPLAY' : over <= 15 ? 'MIDDLE' : 'DEATH';
  }
  if (match.format === 'ODI' && (limit === null || limit === 300)) {
    return over <= 10 ? 'POWERPLAY' : over <= 40 ? 'MIDDLE' : 'DEATH';
  }
  return null;
}

export function liveEquation(match: Match, innings?: InningsScore[]): LiveEquation | null {
  const current = currentInnings(match, innings);
  if (!current) return null;

  const perOver = match.ballsPerOver || DEFAULT_BALLS_PER_OVER;
  const battingTeam = current.teamId === match.awayTeam.id ? match.awayTeam : match.homeTeam;
  const bowlingTeam = battingTeam === match.homeTeam ? match.awayTeam : match.homeTeam;
  const ballsBowled = ballsFrom(current.overs, perOver);
  const crr = ballsBowled ? current.runs / (ballsBowled / perOver) : null;

  const base: LiveEquation = {
    innings: current,
    battingTeam,
    bowlingTeam,
    perOver,
    ballsBowled,
    crr,
    target: null,
    need: null,
    ballsLeft: null,
    rrr: null,
    phase: null,
  };

  if (match.format === 'TEST') return base;

  const batted = (innings ?? match.scorecard?.innings ?? []).filter((i) => !i.notStarted);
  const first = batted.find((i) => i !== current && i.teamId !== current.teamId);
  const limit = first ? inningsBallLimit(first, match, perOver) : null;

  base.phase = phaseOf(match, ballsBowled, limit, perOver);
  if (!first || batted.length !== 2 || limit === null) return base;

  const target = first.runs + 1;
  const need = target - current.runs;
  const ballsLeft = limit - ballsBowled;
  return {
    ...base,
    target,
    need: Math.max(need, 0),
    ballsLeft: Math.max(ballsLeft, 0),
    rrr: need > 0 && ballsLeft > 0 ? need / (ballsLeft / perOver) : null,
  };
}

export const isHundred = (match: Pick<Match, 'ballsPerOver'>): boolean =>
  match.ballsPerOver === HUNDRED_BALLS_PER_OVER;

export function equationSentence(eq: LiveEquation): string | null {
  if (eq.need === null || eq.ballsLeft === null || eq.need <= 0) return null;
  const runs = eq.need === 1 ? 'run' : 'runs';
  const balls = eq.ballsLeft === 1 ? 'ball' : 'balls';
  return `${eq.battingTeam.shortName} need ${eq.need} ${runs} from ${eq.ballsLeft} ${balls}`;
}

/** 0..1 of the innings in progress, where the format fixes a length. */
export function inningsProgress(match: Match, innings?: InningsScore[]): number | null {
  const eq = liveEquation(match, innings);
  if (!eq || match.format === 'TEST') return null;
  const batted = (innings ?? match.scorecard?.innings ?? []).filter((i) => !i.notStarted);
  const first = batted.find((i) => i !== eq.innings && i.teamId !== eq.innings.teamId);
  const limit = first
    ? inningsBallLimit(first, match, eq.perOver)
    : match.ballsLimit ?? (match.format === 'T20' ? 20 : 50) * eq.perOver;
  return limit ? eq.ballsBowled / limit : null;
}
