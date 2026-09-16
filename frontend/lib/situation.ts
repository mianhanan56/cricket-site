// The state of a match in one or two sentences — the reading a scoreboard does
// not give you.
//
// Two totals and an over count say what has happened; they do not say where the
// match stands. On a Test they barely say anything at all: 503/9 and 205/7 is a
// deficit of 298, a follow-on 101 runs away and a first innings still going, and
// none of those three facts is on the card. This module derives them.
//
// Everything here is arithmetic over the innings we already fetch. Nothing is
// fetched, and nothing is guessed: where a rule depends on something the feed
// does not say (how many overs are left in the day, which session it is), it is
// left out rather than approximated.

import type { FallOfWicket, InningsScore, Match, Partnership } from '@/types';

/**
 * The first-innings lead that lets a side enforce the follow-on, by scheduled
 * length of the match. Law 14.1, and the reason it is keyed by days rather than
 * by format: a five-day Test and a four-day first-class match are both TEST here
 * and the threshold differs.
 *
 * Only the five-day figure is applied. crex publishes no scheduled-days field,
 * so a four-day domestic match would need the number invented — and 200 is the
 * one the Test cricket this page is read for actually uses.
 */
const FOLLOW_ON_MARGIN = 200;

/** A format played over more than one day, and so with two innings a side. */
const isMultiDay = (match: Match): boolean => match.format === 'TEST';

export interface MatchSituation {
  /**
   * "SL trail by 298 runs" / "IND lead by 12 runs" — where the side batting
   * stands against the other side's aggregate. Null when nothing is behind or
   * ahead yet: the first innings of a match has nothing to compare against.
   */
  margin: string | null;
  /**
   * "SL need 101 runs more to avoid the follow on". Null unless a side is
   * batting its first innings far enough behind for the rule to be live.
   */
  followOn: string | null;
  /**
   * "SL need 150 runs to win" — the fourth-innings chase of a multi-day match.
   * Limited-overs chases are already covered by the header's own run rates.
   */
  target: string | null;
}

/** Runs a side has aggregated across every innings it has batted. */
function aggregate(innings: InningsScore[], teamId: string | undefined): number {
  return innings
    .filter((inn) => !inn.notStarted && sameSide(inn, teamId))
    .reduce((runs, inn) => runs + inn.runs, 0);
}

/**
 * Whether an innings belongs to a side.
 *
 * Strict on the team key rather than falling back to the short name: an
 * unmatched innings must drop out of an aggregate, because a deficit built from
 * the wrong side's runs is a confidently wrong sentence. The fetched card always
 * resolves the key, which is the only card this module is fed.
 */
function sameSide(inn: InningsScore, teamId: string | undefined): boolean {
  return inn.teamId !== undefined && teamId !== undefined && inn.teamId === teamId;
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Where the match stands, in crex's own vocabulary.
 *
 * Fed the *fetched* card rather than `match.scorecard.innings`, for the reason
 * every other derivation on the match page is: only the scorecard endpoint
 * returns innings in innings order, and a lead read off the match list's
 * team-ordered totals is backwards whenever the away side batted first.
 */
export function matchSituation(match: Match, innings: InningsScore[]): MatchSituation {
  const none: MatchSituation = { margin: null, followOn: null, target: null };

  const batted = innings.filter((inn) => !inn.notStarted);
  const current = batted[batted.length - 1];
  if (!current || match.status === 'UPCOMING') return none;

  // The other side is whichever of the two the innings in progress is not. Read
  // off the match rather than off the card: an innings carries one team id, and
  // the fixture is what names the pair.
  const battingId = current.teamId;
  const opponentId =
    battingId === match.homeTeam.id ? match.awayTeam.id : match.homeTeam.id;
  if (!battingId || battingId === opponentId) return none;

  const own = aggregate(batted, battingId);
  const theirs = aggregate(batted, opponentId);
  const side = current.teamShortName;

  // Limited overs: the chase is a target and a rate, which the header already
  // prints. A lead there is a completed first innings restated.
  if (!isMultiDay(match)) return none;

  const ownInnings = batted.filter((inn) => sameSide(inn, battingId)).length;
  const theirInnings = batted.filter((inn) => sameSide(inn, opponentId)).length;
  const deficit = theirs - own;

  // A fourth innings is a chase, and a chase is a target, not a deficit: 40 runs
  // behind with the last innings in progress means 41 to win.
  const chasing = ownInnings === 2 && theirInnings === 2;
  if (chasing && deficit >= 0) {
    return {
      margin: `${side} trail by ${plural(deficit, 'run')}`,
      followOn: null,
      target: `${side} need ${plural(deficit + 1, 'run')} to win`,
    };
  }

  const margin =
    deficit > 0
      ? `${side} trail by ${plural(deficit, 'run')}`
      : deficit < 0
        ? `${side} lead by ${plural(-deficit, 'run')}`
        : theirInnings > 0
          ? 'Scores level'
          : null;

  // The follow-on is live in exactly one situation: a side batting its first
  // innings against a completed one, still short of the margin. `theirInnings`
  // being 1 keeps it off a third innings, where the option has already been
  // taken or declined.
  const followOnLive =
    ownInnings === 1 && theirInnings === 1 && current.wickets < 10 && deficit > 0;
  const toAvoid = theirs - FOLLOW_ON_MARGIN + 1 - own;

  return {
    margin,
    followOn:
      followOnLive && toAvoid > 0
        ? `${side} need ${plural(toAvoid, 'run')} more to avoid the follow on`
        : null,
    target: null,
  };
}

/** The stand at the crease, and the wicket before it. */
export interface CreaseContext {
  partnership: Partnership | null;
  lastWicket: FallOfWicket | null;
}

/**
 * The current partnership and the last wicket to fall, from the innings in
 * progress.
 *
 * Both are the card's own figures: the stand is crex's last partnership row,
 * unbroken, and the wicket is the last entry of the fall-of-wickets ledger. A
 * side nought down has neither, which is the correct answer rather than a zero.
 */
export function creaseContext(innings: InningsScore[]): CreaseContext {
  const batted = innings.filter((inn) => !inn.notStarted);
  const current = batted[batted.length - 1];
  if (!current) return { partnership: null, lastWicket: null };

  const stands = current.partnerships ?? [];
  const last = stands[stands.length - 1];
  const wickets = current.fallOfWickets ?? [];

  return {
    partnership: last?.unbroken ? last : null,
    lastWicket: wickets[wickets.length - 1] ?? null,
  };
}
