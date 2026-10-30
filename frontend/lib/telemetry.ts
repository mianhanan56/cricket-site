import type { InningsScore, Match, MatchEvent, Team } from '@/types';
import { DEFAULT_BALLS_PER_OVER, HUNDRED_BALLS_PER_OVER, SCHEDULED_OVERS, ballsFrom, inningsBallLimit } from './overs';

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

/** The chase needs more than it is scoring. */
export function isChaseTight<T extends Pick<LiveEquation, 'rrr' | 'crr'>>(
  eq: T | null | undefined
): eq is T & { rrr: number; crr: number } {
  return eq?.rrr != null && eq.crr != null && eq.rrr > eq.crr;
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

export interface RevisedTarget {
  target: number;
  balls: number;
}

/**
 * The target the feed's own target row states — "SYS-W needs 155 runs in 120 balls" — which is
 * the only place a DLS revision reaches us; the card's scores always say first innings + 1.
 */
export function targetFromFeed(events: ReadonlyArray<Pick<MatchEvent, 'kind' | 'text'>>): RevisedTarget | null {
  const text = events.find((e) => e.kind === 'TARGET' && e.text)?.text ?? '';
  const m = /needs?\s+(\d+)\s+runs?\s+(?:in|from|off)\s+(\d+)\s+balls?/i.exec(text);
  return m ? { target: Number(m[1]), balls: Number(m[2]) } : null;
}

/**
 * What a second innings is chasing and over how many balls: the feed's stated target when it
 * can be a whole-innings one (more runs than scored, more balls than bowled), else first innings + 1.
 */
export function chaseOf(
  first: InningsScore,
  current: InningsScore,
  match: Match,
  perOver: number,
  revised?: RevisedTarget | null
): { target: number; limit: number | null } {
  if (revised && revised.target > current.runs && revised.balls > ballsFrom(current.overs ?? 0, perOver)) {
    return { target: revised.target, limit: revised.balls };
  }
  return { target: first.runs + 1, limit: inningsBallLimit(first, match, perOver) };
}

export function liveEquation(match: Match, innings?: InningsScore[], revised?: RevisedTarget | null): LiveEquation | null {
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
  const chase = first && batted.length === 2 ? chaseOf(first, current, match, perOver, revised) : null;
  const limit = chase ? chase.limit : first ? inningsBallLimit(first, match, perOver) : null;

  base.phase = phaseOf(match, ballsBowled, limit, perOver);
  if (!chase || limit === null) return base;

  const target = chase.target;
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
export function inningsProgress(match: Match, innings?: InningsScore[], revised?: RevisedTarget | null): number | null {
  const eq = liveEquation(match, innings, revised);
  if (!eq || match.format === 'TEST') return null;
  const batted = (innings ?? match.scorecard?.innings ?? []).filter((i) => !i.notStarted);
  const first = batted.find((i) => i !== eq.innings && i.teamId !== eq.innings.teamId);
  const limit =
    eq.ballsLeft !== null
      ? eq.ballsBowled + eq.ballsLeft
      : first
        ? inningsBallLimit(first, match, eq.perOver)
        : match.ballsLimit ?? (SCHEDULED_OVERS[match.format] ?? 0) * eq.perOver;
  return limit ? eq.ballsBowled / limit : null;
}
