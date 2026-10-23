// What has stopped play: breaks, delays, stumps, the toss. The upstream's status table
// (`a`) is the only structured source; anything not in it or in `res` is not
// reported. The upstream also leaves these latched long after play resumes, so most of
// this module is about telling a current stoppage from a stale one.
import type { InningsScore, Match, MatchFormat, MatchNote, MatchNoteKind, MatchStatus } from '@/types';
import { DEFAULT_BALLS_PER_OVER, SCHEDULED_OVERS, ballsFrom, inningsBallLimit } from '../overs';
import type { ApiRawMatch } from './matches';

interface NoteSpec {
  label: string;
  kind: MatchNoteKind;
  /** Play is stopped but the match lives on. */
  paused: boolean;
  /** The gap between two innings, rather than an interval inside one. */
  betweenInnings?: boolean;
  /** The toss has not been made yet. */
  preToss?: boolean;
}

/** The upstream's status codes (the letter after "$"), labels verbatim from their bundle. */
const NOTE_CODES: Record<string, NoteSpec> = {
  a: { label: 'Innings Break', kind: 'BREAK', paused: true, betweenInnings: true },
  b: { label: 'Drinks Break', kind: 'BREAK', paused: true },
  c: { label: 'Lunch Break', kind: 'BREAK', paused: true },
  d: { label: 'Tea Break', kind: 'BREAK', paused: true },
  e: { label: 'Break', kind: 'BREAK', paused: true },
  f: { label: 'Rain Delay', kind: 'DELAY', paused: true },
  g: { label: 'Low Light Delay', kind: 'DELAY', paused: true },
  h: { label: 'Match Paused', kind: 'SUSPENDED', paused: true },
  i: { label: 'Cancelled due to rain', kind: 'SUSPENDED', paused: false },
  j: { label: 'Cancelled due to low light', kind: 'SUSPENDED', paused: false },
  k: { label: 'Match Cancelled', kind: 'SUSPENDED', paused: false },
  l: { label: 'Stumps', kind: 'STUMPS', paused: true },
  m: { label: 'Timeout', kind: 'BREAK', paused: true },
  n: { label: 'Match Drawn', kind: 'RESULT', paused: false },
  o: { label: 'Super Over', kind: 'RESULT', paused: false },
  p: { label: 'Match Tied', kind: 'RESULT', paused: false },
  q: { label: 'Abandoned', kind: 'SUSPENDED', paused: false },
  r: { label: 'Rescheduled', kind: 'SUSPENDED', paused: false },
  s: { label: 'Toss delayed', kind: 'DELAY', paused: true, preToss: true },
  t: { label: 'Toss delayed due to rain', kind: 'DELAY', paused: true, preToss: true },
  u: { label: 'Toss delayed due to bad weather', kind: 'DELAY', paused: true, preToss: true },
  v: { label: 'Toss delayed due to low light', kind: 'DELAY', paused: true, preToss: true },
  w: { label: 'Toss delayed due to wet outfield', kind: 'DELAY', paused: true, preToss: true },
  x: { label: 'No Result', kind: 'RESULT', paused: false },
};

/** `a` = "^0".."^3": which side won the toss and what they chose. */
const TOSS_CODES: Record<string, { side: 1 | 2; choice: 'bat' | 'bowl' }> = {
  '0': { side: 1, choice: 'bat' },
  '1': { side: 1, choice: 'bowl' },
  '2': { side: 2, choice: 'bat' },
  '3': { side: 2, choice: 'bowl' },
};

// Tone only, for statuses the upstream sends as free text: the label shown is always
// The upstream's own string, and an unrecognised one still shows, as INFO.
const NOTE_TEXT_KINDS: ReadonlyArray<[RegExp, MatchNoteKind]> = [
  [/stumps|day'?s play/i, 'STUMPS'],
  [/break|drinks|lunch|tea|timeout/i, 'BREAK'],
  [/delay|rain|wet|light|weather|suspend/i, 'DELAY'],
  [/abandon|cancel|no result/i, 'SUSPENDED'],
  [/drawn|tied|super over/i, 'RESULT'],
  [/toss/i, 'TOSS'],
];

/** Kinds that mean the match is over, so the note must not claim a pause. */
const TERMINAL_KINDS: ReadonlySet<MatchNoteKind> = new Set(['RESULT', 'SUSPENDED']);

function looksLikeResult(text: string): boolean {
  return /won by|won the match|beat |wins? by/i.test(text);
}

/**
 * The match's own account of what is happening now, or null when it is just
 * cricket. The `a` code wins over `res`; `res` carries the statuses the upstream has no
 * code for ("Start Delayed"), minus result text.
 */
export function decodeMatchNote(
  m: ApiRawMatch,
  teams: { first?: string; second?: string } = {}
): MatchNote | null {
  const detail = m.ac?.trim() || null;
  // A "!" is a display marker in the upstream's own renderer, not part of the code.
  const raw = (m.a ?? '').replace('!', '').trim();

  if (raw.startsWith('^')) {
    const toss = TOSS_CODES[raw.slice(1)];
    const side = toss && (toss.side === 1 ? teams.first : teams.second);
    if (toss && side) {
      return {
        label: `${side} won the toss and chose to ${toss.choice}`,
        kind: 'TOSS',
        detail,
        paused: false,
      };
    }
  }

  // "$l" or a bare "l" is a code; anything longer is a word and goes to the `res` path.
  if (raw && !raw.startsWith('&')) {
    const letter = raw.startsWith('$') ? raw.slice(1) : raw;
    const spec = letter.length === 1 ? NOTE_CODES[letter.toLowerCase()] : undefined;
    if (spec) {
      // "Toss delayed due to wet outfield" already carries the "(wet outfield)" qualifier.
      const said = detail && spec.label.toLowerCase().includes(detail.replace(/[()]/g, '').trim().toLowerCase());
      return {
        label: spec.label,
        kind: spec.kind,
        detail: said ? null : detail,
        paused: spec.paused,
        ...(spec.betweenInnings ? { betweenInnings: true } : null),
        ...(spec.preToss ? { preToss: true } : null),
      };
    }
  }

  const text = m.res?.trim();
  if (!text || looksLikeResult(text)) return null;

  const kind = NOTE_TEXT_KINDS.find(([pattern]) => pattern.test(text))?.[1] ?? 'INFO';
  return {
    label: text,
    kind,
    detail,
    paused: !TERMINAL_KINDS.has(kind),
    fromText: true,
    // The upstream latches its longest innings break as text with no code beside it.
    ...(/innings\s*break/i.test(text) ? { betweenInnings: true } : null),
    // Only on a DELAY: the TOSS kind is the toss having happened.
    ...(kind === 'DELAY' && /toss/i.test(text) ? { preToss: true } : null),
  };
}

const TOTAL_INNINGS: Record<MatchFormat, number> = { TEST: 4, ODI: 2, T20: 2, T10: 2 };

/**
 * Ten down, declared, or the ball quota bowled. `ballsLimit` is a quota the caller
 * derived (a rain-shortened chase), when it has one.
 */
function inningsOver(
  inn: InningsScore,
  format: MatchFormat,
  perOver: number,
  ballsLimit?: number | null
): boolean {
  if (inn.wickets >= 10 || inn.declared) return true;

  const scheduled = SCHEDULED_OVERS[format];
  const limit = ballsLimit ?? (scheduled !== null ? scheduled * perOver : null);
  return limit !== null && ballsFrom(inn.overs, perOver) >= limit;
}

/**
 * An innings break worked out from the scores: /matches/live sends nothing for it
 * (the upstream's own "Players Entering" comes off a Firebase stream we don't read), only
 * a closed innings, no next score and a live state.
 */
export function inningsBreakNote(
  innings: InningsScore[],
  status: MatchStatus,
  format: MatchFormat,
  perOver: number
): MatchNote | null {
  if (status !== 'LIVE') return null;

  // The upstream opens the next innings as an all-zero slot the moment the last one closes; that is the break.
  const played = innings.filter((inn) => inn.overs > 0 || inn.runs > 0 || inn.wickets > 0);
  if (!played.length) return null;

  if (played.length >= TOTAL_INNINGS[format]) return null;
  if (!played.every((inn) => inningsOver(inn, format, perOver))) return null;

  return { label: 'Innings Break', kind: 'BREAK', detail: null, paused: true, betweenInnings: true };
}

/** The stoppages the upstream is known to leave latched on: an interval, and a day's close. */
const LATCH_PRONE_KINDS: ReadonlySet<MatchNoteKind> = new Set(['BREAK', 'STUMPS']);

// Balls arrive 20–30s apart and the shortest interval (drinks) is five minutes,
// so a delivery this recent rules out a break while sitting out a review.
const PLAY_RESUMED_MS = 150_000;

/** What is known about the match, for judging a stoppage the upstream reported. */
export interface StoppageCheck {
  innings: InningsScore[];
  format: MatchFormat;
  perOver?: number;
  /** The newest delivery in the ball feed, ISO, for callers that fetched one. */
  lastBallAt?: string | null;
  /** The moment to read `lastBallAt` against — the poll's, not `Date.now()`, so a render stays pure. */
  now?: number | null;
}

/**
 * Is a reported stoppage contradicted by observed play? Three things count: a
 * ball bowled under a toss the upstream says hasn't happened, a delivery seconds ago, and
 * an innings break over an innings part-way through. Where in the over play
 * stopped is deliberately not judged — rain and bad light stop days mid-over.
 */
export function isStaleStoppage(note: MatchNote, check: StoppageCheck): boolean {
  if (!note.paused) return false;

  const perOver = check.perOver || DEFAULT_BALLS_PER_OVER;

  // The toss is a one-time gate, so a single ball settles it.
  if (note.preToss) return check.innings.some(hasPlay);

  if (!LATCH_PRONE_KINDS.has(note.kind)) return false;

  if (check.lastBallAt && check.now) {
    const bowled = Date.parse(check.lastBallAt);
    if (Number.isFinite(bowled) && check.now - bowled < PLAY_RESUMED_MS) return true;
  }

  if (!note.betweenInnings) return false;

  const batted = check.innings.filter((inn) => !inn.notStarted);
  const batting = batted.find((inn) => inn.phase === 'CURRENT') ?? batted[batted.length - 1];
  if (!batting) return false;

  // The quota the side batting is working to — a chase of a shortened innings ends early.
  const limit =
    batting === batted[0]
      ? null
      : inningsBallLimit(batted[0], { format: check.format, ballsLimit: null }, perOver);
  if (inningsOver(batting, check.format, perOver, limit)) return false;

  return ballsFrom(batting.overs, perOver) > 0;
}

/** The feed's note for a match whose ball feed the caller has, less a stoppage play went through. */
export function feedCheckedNote(
  match: Match,
  feed: { innings: InningsScore[]; lastBallAt: string | null; now: number | null }
): MatchNote | null {
  const note = match.note ?? null;
  if (!note) return null;
  const stale = isStaleStoppage(note, {
    innings: feed.innings.length ? feed.innings : match.scorecard?.innings ?? [],
    format: match.format,
    perOver: match.ballsPerOver,
    lastBallAt: feed.lastBallAt,
    now: feed.now,
  });
  return stale ? null : note;
}

function hasPlay(inn: InningsScore): boolean {
  return !inn.notStarted && (inn.overs > 0 || inn.runs > 0 || inn.wickets > 0);
}

function isLatchProneStoppage(note: MatchNote | null | undefined): boolean {
  return Boolean(note?.paused && LATCH_PRONE_KINDS.has(note.kind));
}

/** One watched match: the stoppage it is reporting, and whether play went on under it. */
export interface StoppageWatch {
  label: string;
  signature: string;
  /** When the score last moved while this same stoppage stood. */
  movedAt: number | null;
  /** How many separate times it moved. */
  moves: number;
  /** When the score was last seen to change, or the watch began. */
  stillSince: number;
}

// One move can be the ball the note was called on, arriving a poll late; this
// many is an innings being played under a label the upstream never took down.
const LATCHED_AFTER_MOVES = 3;

/** Every score on the board — what a break is supposed to hold still. */
function scoreSignature(match: Match): string {
  return (match.scorecard?.innings ?? [])
    .map((inn) => `${inn.runs}/${inn.wickets}@${inn.overs}`)
    .join('|');
}

/**
 * Drop stoppages the caller has watched play carry through, for the match list,
 * which has no ball feed: the poll is the clock. Movement only counts against a
 * stoppage already showing at the previous poll (so the last ball before lunch
 * doesn't cancel lunch), and only for PLAY_RESUMED_MS once the score settles.
 * `watch` is the caller's memory of the previous poll and is updated in place.
 */
export function clearResumedStoppages(
  matches: Match[],
  watch: Map<string, StoppageWatch>,
  now: number
): Match[] {
  const live = new Set(matches.map((m) => m.id));
  for (const id of watch.keys()) {
    if (!live.has(id)) watch.delete(id);
  }

  return matches.map((match) => {
    if (!isLatchProneStoppage(match.note)) {
      watch.delete(match.id);
      return match;
    }

    const label = match.note!.label;
    const signature = scoreSignature(match);
    const seen = watch.get(match.id);

    // A text-only status must first be borne out by the score holding still:
    // on first sight nothing says whether it is current or hours old.
    const unconfirmed = (stillSince: number) => Boolean(match.note!.fromText) && now - stillSince < PLAY_RESUMED_MS;

    if (!seen || seen.label !== label) {
      watch.set(match.id, { label, signature, movedAt: null, moves: 0, stillSince: now });
      return unconfirmed(now) ? { ...match, note: null } : match;
    }

    const moved = seen.signature !== signature;
    const movedAt = moved ? now : seen.movedAt;
    const moves = seen.moves + (moved ? 1 : 0);
    const stillSince = moved ? now : seen.stillSince;
    watch.set(match.id, { label, signature, movedAt, moves, stillSince });

    const latched = moves >= LATCHED_AFTER_MOVES;
    return latched || (movedAt !== null && now - movedAt < PLAY_RESUMED_MS) || unconfirmed(stillSince)
      ? { ...match, note: null }
      : match;
  });
}

/**
 * Which account of the match state to show. A reported stoppage wins unless play
 * has overtaken it; otherwise a derived innings break beats a non-stoppage note
 * (the upstream leaves the toss in `a` for the whole first innings).
 */
export function pickNote(
  reported: MatchNote | null,
  derived: MatchNote | null,
  check: StoppageCheck
): MatchNote | null {
  const current = reported && isStaleStoppage(reported, check) ? null : reported;

  if (current?.paused) return current;
  return derived ?? current;
}
