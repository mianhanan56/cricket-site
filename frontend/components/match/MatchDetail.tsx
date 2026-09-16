'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  BallExtra,
  HeadToHead,
  Match,
  MatchConditions,
  MatchEvent,
  VenueStats,
  OverSummary,
  Team,
  ExtrasBreakdown,
  InningsScore,
  BatsmanLine,
  BowlerLine,
  CommentaryBall,
  TeamFormEntry,
  MatchSquads,
  PlayerOfMatch,
  PointsTableGroup,
  PlayerRole,
  SquadPlayer,
} from '@/types';
import {
  IDLE_INTERVAL_MS,
  useCrexCommentaryHistory,
  useCrexMatch,
  useCrexMatchExtras,
  useCrexMatchSquads,
} from '@/hooks/useCrexMatches';
import {
  DEFAULT_BALLS_PER_OVER,
  HUNDRED_BALLS_PER_OVER,
  ballsFrom,
  formatProgressShort,
  inningsBallLimit,
} from '@/lib/overs';
import { battedInnings, formatTeamScore, inningsFor } from '@/lib/innings';
import { creaseContext, matchSituation } from '@/lib/situation';
import type { MatchSituation } from '@/lib/situation';
import { isStaleStoppage } from '@/lib/crex';
import { PlayerSituations, pausedWord } from './MatchState';
import MatchEvents from './MatchEvents';
import HeadToHeadBlock from './HeadToHead';
import PointsTable from '../series/PointsTable';
import WinProbability from './WinProbability';
import {
  BowlingSkeleton,
  CommentarySkeleton,
  ScorecardSkeleton,
} from './MatchDetailSkeleton';
import Skeleton, { staggerRows } from '../ui/Skeleton';
import BackButton from '../ui/BackButton';
import LocalTime from '../ui/LocalTime';
import TableScroll from '../ui/TableScroll';
import styles from './MatchDetail.module.scss';

type TabKey = 'info' | 'scorecard' | 'commentary' | 'table';

/**
 * The tab row. `table` is conditional — it is only drawn for a competition that
 * has standings, so a bilateral tour keeps the three tabs it has always had.
 *
 * It sits last rather than beside Match Info because it is the only tab that is
 * not about *this match*: the first three are the match at three levels of
 * detail, and the standings are the competition around it.
 */
const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'info', label: 'Match Info' },
  { key: 'scorecard', label: 'Scorecard' },
  { key: 'commentary', label: 'Commentary' },
  { key: 'table', label: 'Points Table' },
];

/**
 * A delivery as this component renders it — the feed's ball minus the fields
 * nothing here reads (`isBoundary` is re-derived from `runs`). `timestamp` is
 * never printed, but it dates the last ball, which is how the header tells a
 * stoppage crex is still reporting from one it has stopped updating.
 */
type BallEntry = Pick<
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

const toBallEntry = ({
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

const MAX_COMMENTARY = 60;
// Three overs of the recent-balls strip. Two is too short to read the shape of
// a spell; the feed is paged back far enough to fill it (see getCrexCommentary).
const MAX_DOTS = 18;

// "287/4", or "462 & 193/10" once a Test side has batted twice, with the current
// innings' overs on their own line so the header never wraps mid-score on mobile.
//
// The runs come from `formatTeamScore`, the same function the match card uses, so
// a side's score is written identically wherever the reader meets it. An innings
// crex lists before it starts is skipped by it: an XI belongs on the scorecard,
// but a "0/0" next to a side that has not batted is a wrong score.
function scoreParts(
  list: InningsScore[],
  perOver: number,
  multiInnings: boolean
): { runs: string; overs: string } | null {
  const batted = battedInnings(list);
  if (!batted.length) return null;
  return {
    runs: formatTeamScore(batted, multiInnings),
    overs: `(${formatProgressShort(batted[batted.length - 1].overs, perOver)})`,
  };
}



/**
 * "2nd", "3rd", "11th" — for the match's number inside its series.
 *
 * The teens are the whole reason this is not `n + suffix[n % 10]`: 11th, 12th
 * and 13th all take "th", and a five-match rubber never reaches them, but a
 * 111th one-day international does.
 */
function ordinal(n: number): string {
  const teens = n % 100;
  if (teens >= 11 && teens <= 13) return `${n}th`;

  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

/** No trail, no follow-on, no target — what a match that is not being played has. */
const NO_SITUATION: MatchSituation = { margin: null, followOn: null, target: null };

// The format beside a match number reads as a name — "2nd Test" — where the
// enum shouted back ("2nd TEST") does not. ODI and T20 are already the way they
// are written.
const FORMAT_LABEL: Record<Match['format'], string> = {
  TEST: 'Test',
  ODI: 'ODI',
  T20: 'T20',
};

function dismissalOf(b: BatsmanLine): string {
  if (b.dismissal) return b.dismissal;
  return b.out ? 'out' : 'not out';
}

// "(b 0, lb 4, w 0, nb 0)" — the four standing extras lines, always all four so
// the row reads as a fixed shape from innings to innings, plus the penalty only
// when one was actually awarded (it is otherwise a column of zeroes nobody is
// looking for). Null when the source did not send a breakdown, which leaves the
// bare total rather than a row of invented zeroes.
function formatExtras(e: ExtrasBreakdown | undefined): string | null {
  if (!e) return null;

  const parts = [`b ${e.byes}`, `lb ${e.legByes}`, `w ${e.wides}`, `nb ${e.noBalls}`];
  if (e.penalty) parts.push(`p ${e.penalty}`);

  return `(${parts.join(', ')})`;
}

// The `*` means "unbeaten at the crease". A retired batsman is also not out,
// but has left the middle — their card says so in words instead.
function atCrease(b: BatsmanLine): boolean {
  return !b.out && dismissalOf(b) === 'not out';
}

// A bowler's spell. Always one decimal so a completed one reads "4.0", not "4"
// — except on The Hundred, where a spell is a plain count of balls.
function fmtOvers(overs: number, perOver: number): string {
  if (perOver === HUNDRED_BALLS_PER_OVER) return String(ballsFrom(overs, perOver));
  return overs.toFixed(1);
}

/**
 * The name a strip group is filed under. `over` counts COMPLETED overs, so the
 * deliveries numbered `31.x` are bowled in the 32nd — same convention crex
 * prints, and the reason the group heading is one higher than the ball numbers
 * it used to sit under. The Hundred has no overs, so its groups are sets of five.
 */
function overGroupLabel(over: number, perOver: number): string {
  return perOver === HUNDRED_BALLS_PER_OVER ? `Set ${over + 1}` : `Over ${over + 1}`;
}

/**
 * Where a delivery sits in the innings. The last legal ball of an over closes
 * it, so it reads as the next over's start — "66.0", never "65.6".
 */
function ballPosition(b: BallEntry, perOver: number): string {
  if (!isIllegal(b) && b.ball >= perOver) return `${b.over + 1}.0`;
  return `${b.over}.${b.ball}`;
}

/**
 * How each kind of extra is written: a token small enough for a 26px dot, and
 * the words for the commentary column and for screen readers.
 */
const EXTRA_LABELS: Record<BallExtra, { short: string; long: string }> = {
  wide: { short: 'wd', long: 'Wide' },
  noball: { short: 'nb', long: 'No Ball' },
  bye: { short: 'b', long: 'Bye' },
  legbye: { short: 'lb', long: 'Leg Bye' },
};

/** Wides and no balls cost a run before anything is run off them. */
function isIllegal(b: BallEntry): boolean {
  return b.extra === 'wide' || b.extra === 'noball';
}

/** Runs on top of the penalty an illegal delivery costs by itself. */
function scoredOffExtra(b: BallEntry): number {
  return Math.max(b.runs - 1, 0);
}

// Boundaries are read off the bat, not off the total: four wides is an extra,
// not a four, and colouring it green would say the batter hit it.
function dotKind(b: BallEntry): 'wicket' | 'six' | 'four' | 'extra' | 'dot' {
  if (b.isWicket) return 'wicket';
  if (b.batRuns === 6) return 'six';
  if (b.batRuns === 4) return 'four';
  if (b.extra) return 'extra';
  return 'dot';
}

function plural(runs: number): string {
  return runs === 1 ? '1 run' : `${runs} runs`;
}

/**
 * The delivery in a dot's worth of characters: "W", "4", "wd", "wd+4", "1lb".
 * An illegal delivery reads as its own token plus whatever came off it, so a
 * wide is never a "0".
 */
function shortLabel(b: BallEntry): string {
  if (b.isWicket) return b.runs ? `W+${b.runs}` : 'W';
  if (isIllegal(b)) {
    const scored = scoredOffExtra(b);
    const token = EXTRA_LABELS[b.extra as BallExtra].short;
    return scored ? `${token}+${scored}` : token;
  }
  if (b.extra) return `${b.runs}${EXTRA_LABELS[b.extra].short}`;
  return String(b.runs);
}

/** The same delivery in words — "Wide + 1 run", "No Ball + 4 runs", "4 runs". */
function runsLabel(b: BallEntry): string {
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

/** "21.2 — Wide + 1 run", for the strip's tooltips and screen readers. */
function ballTitle(b: BallEntry): string {
  return `${b.over}.${b.ball} — ${runsLabel(b)}`;
}

// Plain deliveries ('dot') have no extra class — avoid className "undefined".
function kindClass(b: BallEntry): string {
  return styles[dotKind(b)] ?? '';
}

// ------------------------------------------------------------- At the crease

interface Crease {
  /** Short name of the side batting, and of the side in the field. */
  battingTeam: string;
  fieldingTeam: string;
  /** The unbeaten batters, striker first when the feed says who that is. */
  batsmen: Array<{ line: BatsmanLine; onStrike: boolean }>;
  /** The bowler mid-spell — null when the feed doesn't name one we can match. */
  bowler: BowlerLine | null;
}

const normalizeName = (s: string) => s.toLowerCase().replace(/[^a-z\s]/g, ' ').trim();

/**
 * Does a card name and a commentary name refer to the same player?
 *
 * The two feeds spell players differently — the card carries "Rashid Khan", the
 * commentary usually a surname alone — so this asks whether every word the
 * commentary used appears in the card name. A surname match is enough; a
 * mismatch just leaves the striker unmarked rather than marking the wrong one.
 */
function nameMatches(cardName: string, feedName: string): boolean {
  const card = normalizeName(cardName).split(/\s+/);
  const feed = normalizeName(feedName).split(/\s+/).filter(Boolean);
  if (!feed.length || !card.length) return false;
  return feed.every((t) => card.includes(t));
}

/**
 * The bowler and the striker off a delivery's headline, which crex writes as
 * "Bumrah to Root" ahead of the description (joined with an em dash by
 * `getCrexCommentary`). Anything that doesn't look like that headline — a ball
 * with no `c1`, so the description leads — is left alone; the strip then shows
 * the two not-out batters without marking a striker.
 */
function namesFromBall(text: string): { bowler: string; striker: string } | null {
  const head = text.split('—')[0].trim().replace(/[,.]$/, '');
  if (head.split(/\s+/).length > 8) return null;

  const m = /^(.+?)\s+to\s+(.+)$/.exec(head);
  return m ? { bowler: m[1], striker: m[2] } : null;
}

// ------------------------------------------------------------------ Run rates

interface Rates {
  /** Current run rate for the innings in progress. */
  crr: number;
  /** Required run rate — null unless a target is being chased. */
  rrr: number | null;
  /** "PAK-GO need 130 runs in 80 balls", or null when nothing is being chased. */
  chase: string | null;
}

/**
 * CRR for the innings in progress, plus the chase numbers when there is a target.
 *
 * Deliberately fed the fetched scorecard rather than `match.scorecard.innings`:
 * only the scorecard endpoint returns innings in *innings* order. The header's
 * own scores are decoded from the match list, where the two totals arrive in team
 * order — first-innings-first is not guaranteed there, and getting it backwards
 * would print a confidently wrong target.
 */
function computeRates(match: Match, innings: InningsScore[]): Rates | null {
  const perOver = match.ballsPerOver || DEFAULT_BALLS_PER_OVER;
  const batted = innings.filter((i) => !i.notStarted);
  if (!batted.length) return null;

  const current = batted[batted.length - 1];
  const ballsBowled = ballsFrom(current.overs, perOver);
  if (!ballsBowled) return null;

  const crr = current.runs / (ballsBowled / perOver);

  // A chase needs a completed innings to chase and a limit to do it in, so this
  // is the second innings of a limited-overs match and nothing else.
  const limit = batted.length === 2 ? inningsBallLimit(batted[0], match, perOver) : null;
  if (limit === null) return { crr, rrr: null, chase: null };

  const needRuns = batted[0].runs + 1 - current.runs;
  const ballsLeft = limit - ballsBowled;
  if (needRuns <= 0 || ballsLeft <= 0) return { crr, rrr: null, chase: null };

  return {
    crr,
    rrr: needRuns / (ballsLeft / perOver),
    chase: `${current.teamShortName} need ${needRuns} ${
      needRuns === 1 ? 'run' : 'runs'
    } in ${ballsLeft} ${ballsLeft === 1 ? 'ball' : 'balls'}`,
  };
}

export default function MatchDetail({
  matchId,
  initial,
  preview = false,
  headToHead,
  seriesTable,
}: {
  matchId: string;
  initial: Match;
  /**
   * This is a fixture crex has not allocated a match key to yet, addressed by its
   * slot in the series schedule. Nothing keyed by match exists upstream — no
   * card, no feed, no announced squads — so every client fetch here is off, and
   * the page is the header, the countdown and the context around it.
   */
  preview?: boolean;
  /**
   * The record between the two sides, derived server-side from the schedule.
   * Static for the life of the page — a head-to-head does not move while a match
   * is on — so it is a prop rather than another poll. Null when they have not met
   * inside the schedule window, which is the normal case for a first meeting.
   */
  headToHead?: HeadToHead | null;
  /**
   * The competition's standings, where it has any. Empty on a bilateral tour and
   * on a league that has not started, which is most matches.
   */
  seriesTable?: PointsTableGroup[];
}) {
  const [match, setMatch] = useState<Match>(initial);
  const [tab, setTab] = useState<TabKey>('info');

  const hasTable = Boolean(seriesTable?.length);
  const tabs = hasTable ? TABS : TABS.filter((t) => t.key !== 'table');

  // Seed commentary + ball dots from the initial server-fetched scorecard. Both
  // initialisers are lazy: the seed only matters on the first render, and the
  // polls below replace it wholesale.
  const [commentary, setCommentary] = useState<BallEntry[]>(() =>
    (initial.scorecard?.commentary ?? []).map(toBallEntry).reverse()
  );
  const [dots, setDots] = useState<BallEntry[]>(() =>
    (initial.scorecard?.commentary ?? []).map(toBallEntry).slice(-MAX_DOTS)
  );

  const isLive = match.status === 'LIVE';

  // Every match now comes from crex, which has no push channel — the Worker is
  // polled instead. There used to be a socket path here for backend-sourced
  // matches; the socket server was dropped in the move to Workers, so it was
  // connecting to nothing.
  //
  // Polling is NOT gated on the match being live. Gating on
  // `match.status === 'LIVE'` deadlocked the page: `match` is local state seeded
  // from the server render, so a page opened before the toss never polled,
  // therefore never learned the match had started, therefore never started
  // polling. The reader sat on "UPCOMING" for the whole session unless they
  // reloaded by hand.
  //
  // What the status decides is the cadence, and whether there is any point at
  // all. A live match is asked every couple of seconds. One yet to start is
  // asked at `IDLE_INTERVAL_MS` — fast enough to catch the toss, cheap enough to
  // leave open. A finished one is not asked again: that state is terminal, and
  // this is the only place the poll can be stopped without the deadlock coming
  // back with it.
  const { match: polled, lastUpdated } = useCrexMatch(matchId, {
    initial,
    enabled: !preview && match.status !== 'COMPLETED',
    intervalMs: isLive ? undefined : IDLE_INTERVAL_MS,
  });

  // Scorecard + ball-by-ball, but only while the match is live or recently
  // finished — an upcoming fixture has neither.
  const extrasEnabled = !preview && match.status !== 'UPCOMING';
  const crexExtras = useCrexMatchExtras(matchId, {
    enabled: extrasEnabled,
    // A finished match's card and feed are final: fetch them, then stop. Only a
    // live one is worth asking again.
    repeat: isLive,
    ballsPerOver: match.ballsPerOver,
    // Lets the fetched card mark which innings is being played, which is what
    // the innings ledger and the scorecard's phase labels read.
    status: match.status,
  });

  // A crex match arrives with a header score but no card or feed — those are two
  // more round trips. Until the first one lands, the Scorecard and Commentary
  // tabs are loading, not empty, and have to say so with placeholders instead of
  // "No batting data yet".
  const extrasPending = extrasEnabled && !crexExtras.loaded;

  // Announced squads, from crex's pre-match info. `match.squads` used to be
  // filled in by our own backend and has been empty since crex became the only
  // source, so both tabs read this instead. Keyed by team, because crex lists
  // the sides in its own order.
  //
  //
  // Fetched at every stage now, not only before the toss: the same response
  // carries the forecast, the officials and the ground's record, which the Match
  // Info tab shows for a match in progress too, and its `tp` field keeps the
  // eleven that took the field even after crex prunes the wider squad.
  const squadsEnabled = !preview;
  const {
    squads: squadsByTeam,
    conditions,
    loaded: squadsLoaded,
  } = useCrexMatchSquads(matchId, { enabled: squadsEnabled });
  const squads = useMemo(() => {
    const home = squadsByTeam[match.homeTeam.id] ?? match.squads?.home ?? [];
    const away = squadsByTeam[match.awayTeam.id] ?? match.squads?.away ?? [];
    return home.length || away.length ? { home, away } : null;
  }, [squadsByTeam, match.homeTeam.id, match.awayTeam.id, match.squads]);

  // The squad fetch is a round trip of its own, and on an upcoming match the
  // list is the tallest thing on the tab — so the section is held open with
  // placeholders rather than appearing two seconds in and shoving the details
  // table down the page.
  // Only before the toss, where the list is the tallest thing on the tab. On a
  // live match the scorecard above it already names everyone, so a column of
  // grey bars would be the loudest thing on the page for no gain.
  const squadsPending = squadsEnabled && match.status === 'UPCOMING' && !squadsLoaded && !squads;

  // Fold each poll into local state. The crex scorecard replaces the innings
  // wholesale — it is a complete card each time, not a delta.
  useEffect(() => {
    if (!polled) return;

    setMatch(
      crexExtras.innings.length
        ? { ...polled, scorecard: { ...polled.scorecard, innings: crexExtras.innings } }
        : polled
    );
  }, [polled, crexExtras.innings]);

  // crex commentary arrives newest-first already, which is the order this
  // component renders in — no reversing.
  useEffect(() => {
    if (!crexExtras.commentary.length) return;

    const entries = crexExtras.commentary.map(toBallEntry);
    setCommentary(entries.slice(0, MAX_COMMENTARY));
    // Dots read oldest-to-newest, so the tail of the feed reversed.
    setDots([...entries].reverse().slice(-MAX_DOTS));
  }, [crexExtras.commentary]);

  // A landed poll is this page's equivalent of "connected" — without it the
  // header would sit on "connecting…" forever while updating perfectly well.
  const isConnected = Boolean(lastUpdated);

  const innings = match.scorecard?.innings ?? [];
  const perOver = match.ballsPerOver || DEFAULT_BALLS_PER_OVER;
  // The header's status word. A stoppage names itself ("Stumps", "Delay"); a match
  // that is simply being played says nothing, since everything below the badge
  // already reports live play. Upcoming and finished keep a quiet label, which is
  // the only thing at the top of the page that dates it.
  // `pausedWord` decides *whether* there is a stoppage to report; the label is
  // taken in full here rather than reduced to one word, because a page header has
  // room for "Innings Break" and a carousel card did not.
  //
  // Checked against the innings and the ball feed first: crex latches its break code
  // and stops updating it once play resumes, and this page holds both the freshest
  // score there is (the scorecard endpoint's, not the list's) and the time of the
  // last delivery, so it is the surface best placed to notice. See `isStaleStoppage`.
  //
  // The ball's age is only read once a poll has landed, and against that poll's own
  // clock rather than `Date.now()`: the server rendered this header too, and a
  // stoppage that evaporated between the two would be a hydration mismatch.
  const note =
    match.note &&
    isStaleStoppage(match.note, {
      innings,
      format: match.format,
      perOver,
      lastBallAt: commentary[0]?.timestamp ?? null,
      now: lastUpdated?.getTime() ?? null,
    })
      ? null
      : match.note;
  const stopped = pausedWord(match.status, note) ? note?.label ?? null : null;
  const statusWord = isLive
    ? stopped
    : match.status === 'UPCOMING'
      ? 'UPCOMING'
      : 'RESULT';
  const statusTone = stopped
    ? styles.statusPaused
    : match.status === 'UPCOMING'
      ? styles.statusUpcoming
      : styles.statusResult;

  // A Test is the only format where a side bats twice, and the only one where a
  // closed innings is written without its wickets ("462", not "462/10").
  const multiInnings = match.format === 'TEST';
  const homeScore = scoreParts(inningsFor(match, match.homeTeam), perOver, multiInnings);
  const awayScore = scoreParts(inningsFor(match, match.awayTeam), perOver, multiInnings);

  // The delivery just bowled, shown large in the middle of the header. `dots` runs
  // oldest to newest, so the last entry is the live one.
  //
  // Not while play is stopped: at an innings break the newest delivery is the last
  // ball of the innings that just ended, and showing it in the "just happened" slot
  // says a ball was bowled a moment ago when nobody is even at the crease.
  const lastBall = isLive && !stopped ? dots[dots.length - 1] ?? null : null;

  // Rates come off the fetched card, not `innings` — see computeRates. They are a
  // live-only reading: a finished match has a result, which says more.
  const rates = useMemo(
    () => (isLive ? computeRates(match, crexExtras.innings) : null),
    [isLive, match, crexExtras.innings]
  );

  // The commentary tab's own, deeper walk of the same feed. Started when the tab
  // is first opened and never on the poll: three overs is all the live tick pages
  // back for, which is a window a wicket filter is empty in.
  const history = useCrexCommentaryHistory(matchId, {
    enabled: !preview && tab === 'commentary' && match.status !== 'UPCOMING',
  });

  // The live tail and the loaded history as one feed. The tail is what keeps the
  // newest ball at the top between walks; the history is everything under it.
  //
  // Ordered by innings, then over, then ball — NOT by the feed's id. The id is an
  // epoch and sorts correctly right up until a row arrives without one, where the
  // fallback id is "64.3" and sorts as a 64 among timestamps. Over and ball are
  // the order the reader means anyway, and the innings has to lead them: a walk
  // that crosses an innings boundary otherwise interleaves the two, since both
  // innings have an over 12.
  const feedBalls = useMemo(() => {
    const byId = new Map<string, BallEntry>();
    for (const b of commentary) byId.set(b.id, b);
    for (const b of history.balls) byId.set(b.id, toBallEntry(b));
    return [...byId.values()].sort(
      (a, b) =>
        (b.inning ?? 0) - (a.inning ?? 0) || b.over - a.over || b.ball - a.ball
    );
  }, [commentary, history.balls]);

  const feedOvers = useMemo(() => {
    const byId = new Map<string, OverSummary>();
    for (const o of crexExtras.overs) byId.set(o.id, o);
    for (const o of history.overs) byId.set(o.id, o);
    return [...byId.values()].sort((a, b) => b.inning - a.inning || b.over - a.over);
  }, [crexExtras.overs, history.overs]);

  // Where the match stands — the trail/lead, the follow-on, the fourth-innings
  // target. Multi-day readings, and the header's biggest gap until now: two
  // totals on their own do not say who is 300 behind.
  //
  // Live only, like the rates above: a finished Test has a result, and "SL trail
  // by 51 runs" printed beside "AUS won by an innings and 51 runs" says the same
  // thing twice, in the tense of a match still being played.
  const situation = useMemo(
    () => (isLive ? matchSituation(match, crexExtras.innings) : NO_SITUATION),
    [isLive, match, crexExtras.innings]
  );

  // The stand at the crease and the wicket that started it, both off the card.
  const context = useMemo(
    () => (isLive ? creaseContext(crexExtras.innings) : { partnership: null, lastWicket: null }),
    [isLive, crexExtras.innings]
  );

  // Who is actually out in the middle. Read off the fetched card for the same
  // reason the rates are — only that endpoint returns innings in innings order,
  // so its last batted innings is the one in progress.
  const crease = useMemo<Crease | null>(() => {
    if (!isLive) return null;

    const batted = crexExtras.innings.filter((i) => !i.notStarted);
    const current = batted[batted.length - 1];
    if (!current) return null;

    const unbeaten = (current.batting ?? []).filter(atCrease);
    if (!unbeaten.length) return null;

    const names = lastBall ? namesFromBall(lastBall.text) : null;
    const striker = names ? unbeaten.find((b) => nameMatches(b.name, names.striker)) : undefined;
    const ordered = striker ? [striker, ...unbeaten.filter((b) => b !== striker)] : unbeaten;

    return {
      battingTeam: current.teamShortName,
      fieldingTeam:
        [match.homeTeam.shortName, match.awayTeam.shortName].find(
          (s) => s.toLowerCase() !== current.teamShortName.toLowerCase()
        ) ?? '',
      batsmen: ordered.slice(0, 2).map((line) => ({ line, onStrike: line === striker })),
      bowler: names
        ? (current.bowling ?? []).find((b) => nameMatches(b.name, names.bowler)) ?? null
        : null,
    };
  }, [isLive, crexExtras.innings, lastBall, match.homeTeam.shortName, match.awayTeam.shortName]);

  /**
   * The recent-balls strip, grouped the way a scoreboard reads it: one row of
   * deliveries per over, headed by the over and closed by what it cost.
   *
   * Totals come from `commentary`, not from `dots`: `dots` is capped at
   * MAX_DOTS, so its OLDEST over is usually cut off mid-way and summing only the
   * deliveries on screen would print a total that disagrees with the scorecard.
   * That group is left unheaded too — it is a tail, not an over.
   */
  const ballGroups = useMemo(() => {
    const runsByOver = new Map<number, number>();
    for (const b of commentary) {
      runsByOver.set(b.over, (runsByOver.get(b.over) ?? 0) + b.runs);
    }

    const groups: Array<{ over: number; balls: BallEntry[] }> = [];
    for (const b of dots) {
      const last = groups[groups.length - 1];
      if (last && last.over === b.over) last.balls.push(b);
      else groups.push({ over: b.over, balls: [b] });
    }

    return groups.map((g, i) => {
      // Only the first group can be clipped by MAX_DOTS — everything after it
      // starts at the top of its over.
      const truncated = i === 0 && g.balls[0].ball > 1;
      // A yet-to-be-bowled slot for the rest of the over in progress, so the
      // reader sees how much of it is left. Illegal deliveries don't advance the
      // over, so they don't consume one.
      const legal = g.balls.filter((b) => !isIllegal(b)).length;
      const pending =
        i === groups.length - 1 && legal < perOver ? perOver - legal : 0;
      return {
        over: g.over,
        balls: g.balls,
        runs: runsByOver.get(g.over) ?? g.balls.reduce((sum, b) => sum + b.runs, 0),
        truncated,
        pending,
      };
    });
  }, [dots, commentary, perOver]);

  // Newest over sits at the right-hand end, past the edge on a narrow screen —
  // so every new delivery pulls the strip along to stay in view.
  const stripRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = stripRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [dots]);

  return (
    <div className={styles.page}>
      <BackButton />

      {/* The wicket-alert banner lived here. It was driven by the socket's
          `wicket:fall` event; crex's feed has no equivalent push, and inferring
          a wicket from a poll would fire it late and sometimes twice. Dropped
          rather than faked — the commentary tab still reports the wicket. */}

      {/* ------------------------------------------------ Match header */}
      <header className={styles.header}>
        {/* Status, top right, in a word and in plain type — the same wording the
            match cards use, without the badge, because a page header does not need
            to shout what a carousel card had to.

            Nothing at all while the ball is in play: a LIVE badge here competed
            with the live score, the strike rates and the ball strip directly under
            it, all of which say the same thing more usefully. */}
        {(statusWord || (isLive && !isConnected)) && (
          <div className={styles.statusRow}>
            {isLive && !isConnected && <span className={styles.connLabel}>connecting…</span>}
            {statusWord && (
              <span className={`${styles.statusWord} ${statusTone}`}>{statusWord}</span>
            )}
          </div>
        )}

        <div className={styles.teams}>
          <div className={styles.team}>
            {/* The full name only. The short code that sat under it repeated the
                same team twice in three lines, and the abbreviation already appears
                wherever a figure needs one — the crease labels, the run-rate line,
                the scorecard's innings picker. */}
            <span className={styles.teamName}>{match.homeTeam.name}</span>
            <span className={styles.score}>{homeScore?.runs ?? '—'}</span>
            {homeScore && <span className={styles.scoreOvers}>{homeScore.overs}</span>}
          </div>
          {/* The centre column carries the last ball while one is live, and falls
              back to "VS" before the feed lands or once the match is over. */}
          {lastBall ? (
            <div className={styles.lastBall}>
              <span
                // Remounts on every delivery, which is what replays the pop.
                key={lastBall.id}
                className={`${styles.lastBallValue} ${kindClass(lastBall)} ${
                  shortLabel(lastBall).length > 2 ? styles.lastBallLong : ''
                }`}
                aria-label={`Last ball: ${runsLabel(lastBall)}`}
              >
                {shortLabel(lastBall)}
              </span>
              <span className={styles.lastBallOver}>
                {ballPosition(lastBall, perOver)}
              </span>
            </div>
          ) : (
            <span className={styles.vs}>VS</span>
          )}
          <div className={`${styles.team} ${styles.right}`}>
            <span className={styles.teamName}>{match.awayTeam.name}</span>
            <span className={styles.score}>{awayScore?.runs ?? '—'}</span>
            {awayScore && <span className={styles.scoreOvers}>{awayScore.overs}</span>}
          </div>
        </div>

        {/* Run rates — the reading that turns two scores into a state of play. */}
        {rates && (
          <div className={styles.rates}>
            <dl className={styles.rateList}>
              <div className={styles.rate}>
                <dt className={styles.rateLabel}>CRR</dt>
                <dd className={styles.rateValue}>{rates.crr.toFixed(2)}</dd>
              </div>
              {rates.rrr !== null && (
                <div className={styles.rate}>
                  <dt className={styles.rateLabel}>RRR</dt>
                  <dd className={`${styles.rateValue} ${styles.rateChase}`}>
                    {rates.rrr.toFixed(2)}
                  </dd>
                </div>
              )}
            </dl>
            {rates.chase && <p className={styles.chase}>{rates.chase}</p>}
          </div>
        )}

        {/* Where the match stands. Three separate sentences rather than one
            joined line: the trail is a fact about the score, the follow-on and
            the target are things that have to be done about it, and on a Test
            they are frequently all live at once. */}
        {(situation.margin || situation.followOn || situation.target) && (
          <div className={styles.situation}>
            {situation.margin && <p className={styles.margin}>{situation.margin}</p>}
            {situation.target && <p className={styles.chase}>{situation.target}</p>}
            {situation.followOn && (
              <p className={styles.followOn}>{situation.followOn}</p>
            )}
          </div>
        )}

        {/* Out in the middle — the two batters and the bowler mid-spell, each
            under the short name of the side they are playing for. */}
        {crease && (
          <div className={styles.crease}>
            <div className={styles.creaseGroup}>
              <span className={styles.creaseLabel}>
                Batting<span className={styles.creaseTeam}>{crease.battingTeam}</span>
              </span>
              <ul className={styles.creaseList}>
                {crease.batsmen.map(({ line, onStrike }) => (
                  <li
                    key={line.playerId}
                    className={`${styles.creasePlayer} ${onStrike ? styles.onStrike : ''}`}
                  >
                    <PlayerLink id={line.playerId} name={line.name} className={styles.creaseName}>
                      {onStrike && <span className={styles.strikeMark}> *</span>}
                    </PlayerLink>
                    <span className={styles.creaseFigures}>
                      {line.runs} <span className={styles.creaseBalls}>({line.balls})</span>
                      <span className={styles.creaseRate}>
                        SR {line.strikeRate.toFixed(1)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {crease.bowler && (
              <div className={`${styles.creaseGroup} ${styles.right}`}>
                <span className={styles.creaseLabel}>
                  Bowling<span className={styles.creaseTeam}>{crease.fieldingTeam}</span>
                </span>
                <ul className={styles.creaseList}>
                  <li className={styles.creasePlayer}>
                    <PlayerLink
                      id={crease.bowler.playerId}
                      name={crease.bowler.name}
                      className={styles.creaseName}
                    />
                    <span className={styles.creaseFigures}>
                      {crease.bowler.wickets}/{crease.bowler.runs}{' '}
                      <span className={styles.creaseBalls}>
                        ({fmtOvers(crease.bowler.overs, perOver)})
                      </span>
                      <span className={styles.creaseRate}>
                        Econ {crease.bowler.economy.toFixed(2)}
                      </span>
                    </span>
                  </li>
                </ul>
              </div>
            )}
          </div>
        )}

        {/* The stand at the crease and the wicket before it — the two figures a
            scoreboard shows beside the batters and the only ones that say
            whether this innings is being rebuilt or is falling over. */}
        {(context.partnership || context.lastWicket) && (
          <dl className={styles.standRow}>
            {context.partnership && (
              <div className={styles.stand}>
                <dt className={styles.standLabel}>Partnership</dt>
                <dd className={styles.standValue}>
                  {context.partnership.runs}
                  <span className={styles.standBalls}>({context.partnership.balls})</span>
                </dd>
              </div>
            )}
            {context.lastWicket && (
              <div className={styles.stand}>
                <dt className={styles.standLabel}>Last wicket</dt>
                <dd className={styles.standValue}>
                  <PlayerLink
                    id={context.lastWicket.playerId}
                    name={context.lastWicket.name}
                    className={styles.standName}
                  />
                  <span className={styles.standBalls}>
                    {context.lastWicket.playerRuns}({context.lastWicket.playerBalls})
                  </span>
                  <span className={styles.standAt}>
                    at {context.lastWicket.runs}/{context.lastWicket.wicket}
                  </span>
                </dd>
              </div>
            )}
          </dl>
        )}

        {match.result && <p className={styles.result}>{match.result}</p>}

        {/* Recent balls, over by over: the deliveries of one over on a row of
            their own, headed by the over and closed by what it cost. Reads as a
            spell rather than as eighteen loose numbers — and each delivery keeps
            its exact over.ball in the tooltip and for screen readers. */}
        {isLive && ballGroups.length > 0 && (
          <div className={styles.dots} ref={stripRef} aria-label="Recent balls">
            {ballGroups.map((g) => (
              <section key={g.over} className={styles.stripOver}>
                {/* The clipped oldest group has no heading — it is the tail of an
                    over, and heading it would claim balls that aren't shown. */}
                {!g.truncated && (
                  <h3 className={styles.overLabel}>{overGroupLabel(g.over, perOver)}</h3>
                )}
                <ol className={styles.overBalls}>
                  {g.balls.map((b) => (
                    <li
                      key={b.id}
                      className={`${styles.ballDot} ${kindClass(b)}`}
                      title={ballTitle(b)}
                    >
                      <span aria-hidden="true">{shortLabel(b)}</span>
                      <span className={styles.srOnly}>{ballTitle(b)}</span>
                    </li>
                  ))}
                  {Array.from({ length: g.pending }, (_, i) => (
                    <li key={`pending-${i}`} className={styles.ballPending} aria-hidden="true" />
                  ))}
                </ol>
                <span className={styles.overTotal}>
                  <span aria-hidden="true">= {g.runs}</span>
                  <span className={styles.srOnly}>{g.runs} runs off the over</span>
                </span>
              </section>
            ))}
          </div>
        )}

        {/* The competition, the format, which day of it, and where. Facts about the
            match rather than its state — the innings ledger that sat here is gone,
            because the score line above already reads "462 & 193/10". */}
        <p className={styles.headerMeta}>
          {[
            match.series.name,
            // "2nd Test" where crex numbers the fixture, the bare format where
            // it does not — a tour game outside the numbered rubber.
            match.matchNumber
              ? `${ordinal(match.matchNumber)} ${FORMAT_LABEL[match.format]}`
              : match.format,
            match.status === 'LIVE' && match.day && match.day > 1 ? `Day ${match.day}` : null,
            match.venue,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </header>

      {/* Fed the fetched card for the same reason `rates` is — innings order. */}
      {isLive && <WinProbability match={match} innings={crexExtras.innings} />}

      {/* ------------------------------------------------ Sticky tabs */}
      <nav className={styles.tabs} aria-label="Match sections">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`${styles.tab} ${tab === t.key ? styles.active : ''}`}
            aria-current={tab === t.key ? 'page' : undefined}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'info' && (
        <InfoTab
          match={match}
          events={crexExtras.events}
          innings={crexExtras.innings}
          squads={squads}
          squadsPending={squadsPending}
          conditions={conditions}
          headToHead={headToHead}
          pending={extrasPending}
        />
      )}
      {tab === 'scorecard' && (
        <ScorecardTab
          match={match}
          innings={innings}
          squads={squads}
          pending={extrasPending}
          onShowSquads={() => setTab('info')}
        />
      )}
      {tab === 'commentary' && (
        <CommentaryTab
          balls={feedBalls}
          summaries={feedOvers}
          pending={extrasPending || (history.loading && !feedBalls.length)}
          loadingMore={history.loading}
          exhausted={history.exhausted}
          onLoadMore={history.loadMore}
        />
      )}
      {tab === 'table' && seriesTable && (
        <TableTab
          groups={seriesTable}
          sides={[match.homeTeam.id, match.awayTeam.id]}
        />
      )}
    </div>
  );
}

/**
 * The player's initials, for the medallion the card leads with. crex draws an
 * illustrated portrait here; at this size — one 44px circle on a results card —
 * a monogram reads better than a cropped face, and it never 404s. The portrait
 * itself is on the player's own page.
 */
function initialsOf(name: string): string {
  const words = name.split(/[\s-]+/).filter(Boolean);
  if (!words.length) return '?';
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : '';
  return (first + last).toUpperCase();
}

/**
 * A player's name, linked to their profile.
 *
 * Every name this page prints comes with crex's player f_key already attached —
 * scorecard lines, the XI, the squads and the award all carry it — so the link
 * costs nothing to build. The few that arrive without one (a card line crex has
 * not keyed yet) render as plain text rather than a dead link.
 *
 * Styled as text, not as a link: a scorecard where forty names are all in accent
 * colour is unreadable. The underline appears on hover and focus instead.
 */
function PlayerLink({
  id,
  name,
  className,
  children,
}: {
  id: string | undefined;
  name: string;
  className?: string;
  /** Marks rendered after the name — the not-out star, a captaincy badge. */
  children?: React.ReactNode;
}) {
  if (!id) {
    return (
      <span className={className}>
        {name}
        {children}
      </span>
    );
  }

  return (
    <Link href={`/players/${id}`} className={`${styles.playerLink} ${className ?? ''}`}>
      {name}
      {children}
    </Link>
  );
}

/**
 * The match award, as its own card: who won it, which side they played for, and
 * the figures they won it with.
 *
 * Both figures are optional and a specialist has only one — a batter's award
 * reads without an empty tile where their bowling would go.
 */
function PlayerOfMatchCard({ award, teams }: { award: PlayerOfMatch; teams: Team[] }) {
  // The full team name reads better than the three-letter code the feed packs
  // beside the player; the match already carries both sides, so it costs nothing.
  const team = teams.find((t) => t.id === award.teamId);
  const figures: Array<[string, string]> = [];
  if (award.batting) figures.push(['Batting', award.batting]);
  if (award.bowling) figures.push(['Bowling', award.bowling]);

  return (
    <div className={styles.potm}>
      <span className={styles.potmAvatar} aria-hidden="true">
        {initialsOf(award.name)}
      </span>

      <div className={styles.potmBody}>
        <p className={styles.potmName}>
          <PlayerLink id={award.id} name={award.name} />
        </p>
        <p className={styles.potmTeam}>{team?.name ?? award.teamShortName}</p>

        {figures.length > 0 && (
          <dl className={styles.potmStats}>
            {figures.map(([label, value]) => (
              <div key={label} className={styles.potmStat}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Match Info

function FormStrip({ team, form }: { team: Team; form: TeamFormEntry[] }) {
  return (
    <div className={styles.formRow}>
      <span className={styles.formTeam}>{team.name}</span>
      <div className={styles.formChips}>
        {form.length ? (
          form.map((f) => (
            <span
              key={f.matchId}
              className={`${styles.formChip} ${styles[`form${f.result}`]}`}
              title={`vs ${f.opponent}`}
            >
              {f.result}
            </span>
          ))
        ) : (
          <span className={styles.emptyInline}>No recent matches</span>
        )}
      </div>
    </div>
  );
}

// crex's own words for a role, rather than the enum shouted back at the reader
// ("ALL ROUNDER"). The keeper is a role here because that is how a squad list
// reads — it is the one thing about a batter worth naming before a ball is bowled.
const ROLE_LABELS: Record<PlayerRole, string> = {
  BATSMAN: 'Batter',
  BOWLER: 'Bowler',
  ALL_ROUNDER: 'All-rounder',
  WK: 'Keeper',
};

// Each discipline carries its own tint, so the make-up of a side — how many
// seamers, whether they picked a second spinner — reads off the column without a
// legend to decode. Batter stays neutral: it is the default, and colouring the
// majority of the list would say nothing.
const ROLE_CLASS: Record<PlayerRole, string> = {
  BATSMAN: 'roleBatter',
  BOWLER: 'roleBowler',
  ALL_ROUNDER: 'roleAllRounder',
  WK: 'roleKeeper',
};

/**
 * Ragged name widths for the squad placeholder — a real list is Powell, Athanaze,
 * Hetmyer, not eleven bars of one length.
 */
const SQUAD_SK_WIDTHS = ['60', '80', '50', '70', '60', '90', '70', '50', '80', '60', '70'] as const;

/**
 * A squad panel's placeholder, in the real panel's geometry.
 *
 * The team name is already known from the header, so the band is rendered for
 * real and only the list is placeholder — the reader sees which side is being
 * filled in, not two anonymous grey boxes. Eleven rows: the shortest list crex
 * ever announces, so the section can only grow when the names land, never
 * collapse.
 */
function SquadColumnSkeleton({ team }: { team: Team }) {
  return (
    <div
      className={styles.squadCol}
      role="status"
      aria-busy="true"
      aria-label={`Loading ${team.name} squad`}
    >
      <header className={styles.squadTeam}>
        <h3 className={styles.squadTeamName}>{team.name}</h3>
        <Skeleton className={styles.squadCountSk} />
      </header>
      <ul className={`${styles.squadList} ${staggerRows}`}>
        {SQUAD_SK_WIDTHS.map((width, i) => (
          <li key={i} className={styles.squadPlayer}>
            <span className={`${styles.squadNameCell} ${styles.squadNameCellSk}`}>
              <Skeleton variant="body" width={width} />
            </span>
            <Skeleton className={styles.squadRoleSk} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function SquadColumn({ team, players }: { team: Team; players: SquadPlayer[] }) {
  if (!players.length) return null;

  return (
    <div className={styles.squadCol}>
      <header className={styles.squadTeam}>
        <h3 className={styles.squadTeamName}>{team.name}</h3>
        <span className={styles.squadCount}>{players.length}</span>
      </header>
      <ul className={styles.squadList}>
        {players.map((p) => (
          <li key={p.id} className={styles.squadPlayer}>
            <span className={styles.squadNameCell}>
              <PlayerLink id={p.id} name={p.name} className={styles.squadName} />
              {/* The captaincy is the only rank in a squad list, so it is marked
                  on the name itself rather than folded into the role column. A
                  badge, not "(c)" — at this size the brackets read as ©. */}
              {p.isCaptain && (
                <abbr className={styles.squadCaptain} title="Captain">
                  C
                </abbr>
              )}
            </span>
            <span className={`${styles.squadRole} ${styles[ROLE_CLASS[p.role]]}`}>
              {ROLE_LABELS[p.role]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function InfoTab({
  match,
  events,
  innings,
  squads,
  squadsPending,
  conditions,
  headToHead,
  pending,
}: {
  match: Match;
  events: MatchEvent[];
  /** The fetched card, for the retired-hurt lines. */
  innings: InningsScore[];
  /** Announced squads, or null while crex has none. */
  squads: MatchSquads | null;
  /** The squad fetch is still in flight, and there is nothing to show yet. */
  squadsPending?: boolean;
  /** Forecast, officials, broadcasters and the ground's record. */
  conditions?: MatchConditions | null;
  /** The sides' record, or null when they have not met inside the window. */
  headToHead?: HeadToHead | null;
  pending?: boolean;
}) {
  // Values, not strings: the venue and the series are pages now, and this table
  // is where a reader who wants either of them looks. Both degrade to plain text
  // — a fixture with no allocated venue has nowhere to go.
  const details: Array<[string, React.ReactNode]> = [
    ['Date', <LocalTime key="date" iso={match.startTime} format="dayDate" />],
    ['Time', <LocalTime key="time" iso={match.startTime} format="time" />],
    [
      'Venue',
      match.venueId ? (
        <Link href={`/venues/${match.venueId}`} className={styles.detailLink}>
          {match.venue}
        </Link>
      ) : (
        match.venue
      ),
    ],
    ['Format', match.format],
    ...(match.matchNumber
      ? ([['Match', `${ordinal(match.matchNumber)} of the series`]] as Array<
          [string, React.ReactNode]
        >)
      : []),
    [
      'Series',
      match.series.id ? (
        <Link href={`/series/${match.series.id}`} className={styles.detailLink}>
          {match.series.name}
        </Link>
      ) : (
        match.series.name
      ),
    ],
  ];

  // The toss, in crex's words. It arrives twice — as a status code before the
  // first ball and as a feed event after it — and the feed is the one that
  // survives, so it is read from there and the note is the fallback for the
  // window between the toss and the first delivery.
  const toss =
    events.find((e) => e.kind === 'TOSS')?.text ??
    (match.note?.kind === 'TOSS' ? match.note.label : null);
  if (toss) details.push(['Toss', toss]);

  // "Playing XI" only when both sides actually field eleven; anything else is a
  // squad list, however far into the match we are.
  const squadsTitle =
    match.status !== 'UPCOMING' &&
    squads &&
    squads.home.length === 11 &&
    squads.away.length === 11
      ? 'Playing XI'
      : 'Squads';

  const officials = conditions?.officials;
  const weather = conditions?.weather;
  const venueStats = conditions?.venue;
  const broadcast = conditions?.broadcast ?? [];

  // Events lead the tab while there is a match to have them: they are the most
  // perishable thing on the page, and this tab opens by default, so they sit
  // directly under the score without needing a container of their own above it.
  const showMoments = match.status !== 'UPCOMING';

  return (
    <div className={styles.panel}>
      {/* The award leads the tab on a finished match: it is the last thing to
          happen and the first thing a reader arriving after the result wants. */}
      {match.playerOfMatch && (
        <section className={styles.block}>
          <h2 className={styles.blockTitle}>Player of the Match</h2>
          <PlayerOfMatchCard
            award={match.playerOfMatch}
            teams={[match.homeTeam, match.awayTeam]}
          />
        </section>
      )}

      {showMoments && (
        <section className={styles.block}>
          <h2 className={styles.blockTitle}>Match Events</h2>
          <MatchEvents events={events} pending={pending} />
          {/* Batsmen who left the middle without being dismissed — grouped with the
              moments because that is what a retirement is, and it is the only
              player condition crex publishes as data. */}
          <PlayerSituations innings={innings} />
        </section>
      )}

      {/* Placed above the squads and below the events: a reader on a live match
          wants what just happened first, and a reader on an upcoming one — where
          there are no events — lands on this, which is the right thing to open a
          preview with. */}
      {headToHead && (
        <section className={styles.block}>
          <h2 className={styles.blockTitle}>Head to Head</h2>
          <HeadToHeadBlock record={headToHead} />
        </section>
      )}

      {match.teamForm && (
        <section className={styles.block}>
          <h2 className={styles.blockTitle}>Team Form <span className={styles.blockHint}>last 5</span></h2>
          <FormStrip team={match.homeTeam} form={match.teamForm.home} />
          <FormStrip team={match.awayTeam} form={match.teamForm.away} />
        </section>
      )}

      {(squads || squadsPending) && (
        <section className={styles.block}>
          {/* Before the toss this is the announced squad, eighteen deep; after
              it, crex's list is usually the eleven that took the field. Naming it
              wrongly either promises a bench that isn't there or hides one — and
              on the fixtures where crex publishes no XI, what arrives is a pruned
              part of a squad, nine or fourteen names, which is not an XI either.
              So the claim is made from the lists themselves, not from the
              match's status. */}
          <h2 className={styles.squadsTitle}>{squadsTitle}</h2>
          <div className={styles.squads}>
            {squads ? (
              <>
                <SquadColumn team={match.homeTeam} players={squads.home} />
                <SquadColumn team={match.awayTeam} players={squads.away} />
              </>
            ) : (
              <>
                <SquadColumnSkeleton team={match.homeTeam} />
                <SquadColumnSkeleton team={match.awayTeam} />
              </>
            )}
          </div>
        </section>
      )}

      <section className={styles.block}>
        <h2 className={styles.blockTitle}>Match Details</h2>
        <dl className={styles.details}>
          {details.map(([label, value]) => (
            <div key={label} className={styles.detailRow}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Conditions. Kept below the details table rather than in it: a forecast
          is a set of readings that belong together, and flattening them into
          six more label/value rows buried the venue and the toss. */}
      {weather && (weather.temperature || weather.condition) && (
        <section className={styles.block}>
          <h2 className={styles.blockTitle}>Weather</h2>
          <div className={styles.weather}>
            {weather.temperature && (
              <p className={styles.weatherNow}>
                <span className={styles.weatherTemp}>{weather.temperature}</span>
                {weather.condition && (
                  <span className={styles.weatherWord}>{weather.condition}</span>
                )}
              </p>
            )}
            <dl className={styles.weatherGrid}>
              {(
                [
                  ['Rain', weather.rainChance],
                  ['Humidity', weather.humidity ? `${weather.humidity} %` : null],
                  ['Wind', weather.wind?.replace(/^Windspeed:\s*/i, '') ?? null],
                  [
                    'Range',
                    weather.min && weather.max ? `${weather.min} – ${weather.max}` : null,
                  ],
                ] as Array<[string, string | null]>
              )
                .filter(([, value]) => Boolean(value))
                .map(([label, value]) => (
                  <div key={label} className={styles.weatherCell}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
            </dl>
          </div>
        </section>
      )}

      {officials && (
        <section className={styles.block}>
          <h2 className={styles.blockTitle}>Officials</h2>
          <dl className={styles.details}>
            {officials.onField.length > 0 && (
              <div className={styles.detailRow}>
                <dt>Umpires</dt>
                <dd>{officials.onField.join(' · ')}</dd>
              </div>
            )}
            {officials.thirdUmpire && (
              <div className={styles.detailRow}>
                <dt>Third umpire</dt>
                <dd>{officials.thirdUmpire}</dd>
              </div>
            )}
            {officials.referee && (
              <div className={styles.detailRow}>
                <dt>Referee</dt>
                <dd>{officials.referee}</dd>
              </div>
            )}
          </dl>
        </section>
      )}

      {venueStats && (
        <section className={styles.block}>
          <h2 className={styles.blockTitle}>
            At this Ground{venueStats.label ? ` · ${venueStats.label}` : ''}
          </h2>
          <VenueRecord stats={venueStats} />
        </section>
      )}

      {broadcast.length > 0 && (
        <section className={styles.block}>
          <h2 className={styles.blockTitle}>Where to Watch</h2>
          <ul className={styles.broadcast}>
            {broadcast.map((name) => (
              <li key={name} className={styles.broadcaster}>
                {name}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/**
 * What the ground has done before: the average total per innings, the extremes,
 * and how the toss has played.
 *
 * The averages are the reason this is a component and not four more rows — on a
 * multi-day ground there are four of them, on a limited-overs one two, and the
 * shape of the block is the fact ("first-innings 344, fourth-innings 159" is a
 * pitch that turns). Null slots are dropped rather than printed as a dash.
 */
function VenueRecord({ stats }: { stats: VenueStats }) {
  const averages = stats.averages
    .map((avg, i) => ({ label: `${ordinal(i + 1)} inn`, avg }))
    .filter((a): a is { label: string; avg: number } => a.avg !== null && a.avg > 0);

  return (
    <div className={styles.venueStats}>
      {averages.length > 0 && (
        <dl className={styles.venueAvgs}>
          {averages.map((a) => (
            <div key={a.label} className={styles.venueAvg}>
              <dt>{a.label}</dt>
              <dd>{a.avg}</dd>
            </div>
          ))}
        </dl>
      )}

      <dl className={styles.details}>
        {stats.matches !== null && (
          <div className={styles.detailRow}>
            <dt>Matches</dt>
            <dd>{stats.matches}</dd>
          </div>
        )}
        {(stats.wonBattingFirst !== null || stats.wonBowlingFirst !== null) && (
          <div className={styles.detailRow}>
            <dt>Won batting / bowling first</dt>
            <dd>
              {stats.wonBattingFirst ?? '—'} / {stats.wonBowlingFirst ?? '—'}
            </dd>
          </div>
        )}
        {stats.highest && (
          <div className={styles.detailRow}>
            <dt>Highest total</dt>
            <dd>{stats.highest}</dd>
          </div>
        )}
        {stats.lowest && (
          <div className={styles.detailRow}>
            <dt>Lowest total</dt>
            <dd>{stats.lowest}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

// -------------------------------------------------------------- Points table

/**
 * The competition's standings, as a tab of its own.
 *
 * A tab rather than a block inside Match Info because of what it is: the other
 * three tabs are this match at three levels of detail, and this is the table the
 * match sits in. Buried under the events and the squads it was something a
 * reader had to scroll past the whole preview to find.
 *
 * Rendered even before a ball is bowled, when every column reads zero. That IS
 * the standings of a competition that has not started — it names the sides and
 * says nobody has a point — and it is the state crex shows too.
 *
 * The two sides playing are marked, which is the whole reason this is worth
 * having here rather than only on the series page.
 */
function TableTab({
  groups,
  sides,
}: {
  groups: PointsTableGroup[];
  /** The two team keys to mark. */
  sides: string[];
}) {
  return (
    <div className={styles.panel}>
      <section className={styles.block}>
        <PointsTable groups={groups} highlight={sides} />
      </section>
    </div>
  );
}

// ----------------------------------------------------------------- Scorecard

/**
 * What to call an innings on the card.
 *
 * The index is the *match's* innings order, which is the wrong number to put
 * beside a team name: on a Test, "NEZ — Innings 2" is the match's second innings
 * and New Zealand's first, and a reader looking for their first innings finds a
 * 2 next to it. So where a side bats more than once, the side's own count is
 * used — "NEZ — 1st innings" — and a single-innings format keeps the match order
 * it has always had, where the two are the same thing anyway.
 */
function inningsLabel(inn: InningsScore, index: number, all: InningsScore[]): string {
  if (inn.inning) return inn.inning;

  const twice = all.some((i) => (i.inningsNumber ?? 1) > 1);
  return twice && inn.inningsNumber
    ? `${inn.teamShortName} — ${ordinal(inn.inningsNumber)} innings`
    : `${inn.teamShortName} — Innings ${index + 1}`;
}

function ScorecardTab({
  match,
  innings,
  squads,
  pending,
  onShowSquads,
}: {
  match: Match;
  innings: InningsScore[];
  /** Announced squads, or null while crex has none — only to know whether to point at them. */
  squads: MatchSquads | null;
  /** The card is still being fetched — show placeholders, not an empty state. */
  pending?: boolean;
  /** Switches to the tab the squads are on. */
  onShowSquads: () => void;
}) {
  const [selected, setSelected] = useState(Math.max(0, innings.length - 1));
  const current = innings[Math.min(selected, Math.max(0, innings.length - 1))];
  const perOver = match.ballsPerOver || DEFAULT_BALLS_PER_OVER;
  // The Hundred has no over column — a bowler's spell is counted in balls.
  const isHundred = perOver === HUNDRED_BALLS_PER_OVER;

  // Per-innings lines when the scorecard carries them; otherwise the top-level
  // batting/bowling arrays describe the latest (in-progress) innings only.
  const isLatest = innings.length === 0 || current === innings[innings.length - 1];
  const batting: BatsmanLine[] =
    current?.batting ?? (isLatest ? match.scorecard?.batting ?? [] : []);
  const bowling: BowlerLine[] =
    current?.bowling ?? (isLatest ? match.scorecard?.bowling ?? [] : []);
  const extras = current?.extras ?? (isLatest ? match.scorecard?.extras : undefined);
  const extrasBreakdown =
    current?.extrasBreakdown ?? (isLatest ? match.scorecard?.extrasBreakdown : undefined);
  const yetToBat = current?.yetToBat ?? [];
  const fallOfWickets = current?.fallOfWickets ?? [];
  const partnerships = current?.partnerships ?? [];

  // Before a ball is bowled there is no card at all — crex does not open an
  // innings slot until the first delivery, so a Test hours from its start has
  // nothing here to tabulate. One line saying so, and where the squads are,
  // rather than two tables sitting empty.
  const awaitingFirstBall = !pending && !batting.length && !bowling.length && !yetToBat.length;

  if (awaitingFirstBall) {
    return (
      <div className={styles.panel}>
        <section className={styles.block}>
          <h2 className={styles.blockTitle}>Scorecard</h2>
          <p className={styles.empty}>
            The card opens with the first ball.
            {squads && (
              <>
                {' '}
                <button type="button" className={styles.emptyLink} onClick={onShowSquads}>
                  See the squads
                </button>{' '}
                in Match Info.
              </>
            )}
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      {/* The innings this card is showing, and what it came to.
          
          The score used to appear only as the `Total` row at the foot of the
          batting table — the last thing on a Test card that is four screens
          long, and the first thing a reader wants. It leads now, at the size the
          match header prints a score, and the total row still closes the table
          for anyone reading it as a table. */}
      {current && (
        <div className={styles.inningsHead}>
          {innings.length >= 2 ? (
            <div className={styles.inningsPicker} role="tablist" aria-label="Innings">
              {innings.map((inn, i) => (
                <button
                  key={inn.inning ?? `${inn.teamShortName}-${i}`}
                  type="button"
                  className={`${styles.inningsBtn} ${i === selected ? styles.active : ''}`}
                  onClick={() => setSelected(i)}
                >
                  {inningsLabel(inn, i, innings)}
                </button>
              ))}
            </div>
          ) : (
            <h2 className={styles.inningsName}>
              {inningsLabel(current, 0, innings)}
            </h2>
          )}

          {/* A side that is listed but has not batted has no score to print —
              its 0/0 is an absence, not a total. */}
          {!current.notStarted && (
            <p className={styles.inningsScore}>
              {/* No "d" for a declaration, deliberately: the flag only exists on
                  the feed's innings, and this tab reads the fetched card, which
                  replaces them wholesale and carries no declaration marker of
                  its own. Better absent than shown on some matches and not
                  others. */}
              <span className={styles.inningsRuns}>
                {current.runs}/{current.wickets}
              </span>
              <span className={styles.inningsOvers}>
                ({formatProgressShort(current.overs, perOver)})
              </span>
            </p>
          )}
        </div>
      )}

      <section className={styles.block}>
        <h2 className={styles.blockTitle}>Batting</h2>
        {batting.length ? (
          <TableScroll
            className={styles.tableWrap}
            label={`${current?.teamShortName ?? ''} batting scorecard`.trim()}
          >
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col" className={styles.left}>Batsman</th>
                  <th scope="col" className={styles.left}>How Out</th>
                  <th scope="col">R</th>
                  <th scope="col">B</th>
                  <th scope="col">4s</th>
                  <th scope="col">6s</th>
                  <th scope="col">SR</th>
                </tr>
              </thead>
              <tbody>
                {batting.map((b) => (
                  <tr key={b.playerId}>
                    <td className={styles.left}>
                      <PlayerLink id={b.playerId} name={b.name}>
                        {atCrease(b) && <span className={styles.notout}> *</span>}
                      </PlayerLink>
                    </td>
                    <td className={`${styles.left} ${styles.dismissal}`}>{dismissalOf(b)}</td>
                    <td className={styles.num}>{b.runs}</td>
                    <td className={styles.num}>{b.balls}</td>
                    <td className={styles.num}>{b.fours}</td>
                    <td className={styles.num}>{b.sixes}</td>
                    <td className={styles.num}>{b.strikeRate.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                {extras !== undefined && (
                  <tr className={styles.extrasRow}>
                    <td className={styles.left} colSpan={2}>
                      Extras
                    </td>
                    <td className={styles.num}>{extras}</td>
                    <td className={styles.extrasDetail} colSpan={4}>
                      {formatExtras(extrasBreakdown)}
                    </td>
                  </tr>
                )}
                {current && (
                  <tr className={styles.totalRow}>
                    <td className={styles.left} colSpan={2}>
                      Total
                    </td>
                    <td className={styles.num} colSpan={5}>
                      {current.runs}/{current.wickets} ({formatProgressShort(current.overs, perOver)})
                    </td>
                  </tr>
                )}
              </tfoot>
            </table>
          </TableScroll>
        ) : pending ? (
          <ScorecardSkeleton />
        ) : yetToBat.length ? null : (
          <p className={styles.empty}>
            {current
              ? `No ball-by-ball batting data for this innings — total ${current.runs}/${current.wickets} (${formatProgressShort(current.overs, perOver)}).`
              : 'No batting data yet.'}
          </p>
        )}

        {/* Before an innings starts its whole XI arrives as bare names — that
            is the side's playing eleven, and it is worth showing rather than
            an empty card. Once they start batting the same list is what's
            left to come in. */}
        {yetToBat.length > 0 && (
          <div className={styles.yetToBat}>
            <h3 className={styles.yetToBatTitle}>
              {batting.length ? 'Yet to bat' : 'Playing XI'}
            </h3>
            <ul className={styles.yetToBatList}>
              {yetToBat.map((p, i) => (
                <li key={p.playerId}>
                  {/* Numbers continue the card above, so a side three down
                      starts at 4 rather than restarting at 1. */}
                  <span className={styles.yetToBatNum}>{batting.length + i + 1}</span>
                  <PlayerLink id={p.playerId} name={p.name} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* An innings that has not begun has no bowling to report and no
          promise worth making about it — the section is dropped, not emptied. */}
      {!current?.notStarted && (
      <section className={styles.block}>
        <h2 className={styles.blockTitle}>Bowling</h2>
        {bowling.length ? (
          <TableScroll
            className={styles.tableWrap}
            label={`${current?.teamShortName ?? ''} bowling figures`.trim()}
          >
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col" className={styles.left}>Bowler</th>
                  <th scope="col">{isHundred ? 'B' : 'O'}</th>
                  <th scope="col">M</th>
                  <th scope="col">R</th>
                  <th scope="col">W</th>
                  <th scope="col">Econ</th>
                </tr>
              </thead>
              <tbody>
                {bowling.map((b) => (
                  <tr key={b.playerId}>
                    <td className={styles.left}>
                      <PlayerLink id={b.playerId} name={b.name} />
                    </td>
                    <td className={styles.num}>{fmtOvers(b.overs, perOver)}</td>
                    <td className={styles.num}>{b.maidens}</td>
                    <td className={styles.num}>{b.runs}</td>
                    <td className={styles.num}>{b.wickets}</td>
                    <td className={styles.num}>{b.economy.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        ) : pending ? (
          <BowlingSkeleton />
        ) : (
          <p className={styles.empty}>No bowling data yet.</p>
        )}
      </section>
      )}

      {/* The ledger: where the innings stood at each wicket. Read straight off
          the batting card, which carries the team's score at the moment of every
          dismissal. */}
      {fallOfWickets.length > 0 && (
        <section className={styles.block}>
          <h2 className={styles.blockTitle}>Fall of Wickets</h2>
          <ol className={styles.fow}>
            {fallOfWickets.map((w) => (
              <li key={`${w.wicket}-${w.playerId}`} className={styles.fowItem}>
                <span className={styles.fowScore}>
                  {w.runs}<span className={styles.fowWicket}>/{w.wicket}</span>
                </span>
                <PlayerLink id={w.playerId} name={w.name} className={styles.fowName} />
                <span className={styles.fowFigures}>
                  {w.playerRuns}({w.playerBalls})
                </span>
                <span className={styles.fowOvers}>
                  {formatProgressShort(w.overs, perOver)}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Every stand of the innings, with each batter's share of it. The bar is
          the share itself — how lopsided a stand was is the thing a list of
          numbers hides. */}
      {partnerships.length > 0 && (
        <section className={styles.block}>
          <h2 className={styles.blockTitle}>Partnerships</h2>
          <ul className={styles.stands}>
            {partnerships.map((p, i) => (
              <li key={`${p.a.playerId}-${p.b.playerId}-${i}`} className={styles.standCard}>
                <div className={styles.standTotal}>
                  <span className={styles.standRuns}>{p.runs}</span>
                  <span className={styles.standOff}>({p.balls})</span>
                  {p.unbroken && <span className={styles.standLive}>unbroken</span>}
                </div>
                <div className={styles.standPair}>
                  <span className={styles.standSide}>
                    <PlayerLink id={p.a.playerId} name={p.a.name} className={styles.standName} />
                    <span className={styles.standShare}>
                      {p.a.runs}({p.a.balls})
                    </span>
                  </span>
                  {/* Split by runs, not by balls: the question the bar answers is
                      who made the stand, and a batter can face half of it for a
                      quarter of the runs. */}
                  <span className={styles.standBar} aria-hidden="true">
                    <span
                      className={styles.standBarA}
                      style={{ flexGrow: Math.max(p.a.runs, 0.05) }}
                    />
                    <span
                      className={styles.standBarB}
                      style={{ flexGrow: Math.max(p.b.runs, 0.05) }}
                    />
                  </span>
                  <span className={`${styles.standSide} ${styles.standSideRight}`}>
                    <PlayerLink id={p.b.playerId} name={p.b.name} className={styles.standName} />
                    <span className={styles.standShare}>
                      {p.b.runs}({p.b.balls})
                    </span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Commentary

/**
 * The commentary filters, in the order they are shown.
 *
 * `overs` is the odd one out, and the reason this is a set of predicates over a
 * merged feed rather than a filter on the deliveries: it hides every ball and
 * leaves only the end-of-over cards, which is how a reader catches up on a
 * session they missed without reading three hundred deliveries.
 */
const BALL_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'highlights', label: 'Highlights' },
  { key: 'overs', label: 'Overs' },
  { key: 'wickets', label: 'W' },
  { key: 'sixes', label: '6s' },
  { key: 'fours', label: '4s' },
] as const;

type BallFilter = (typeof BALL_FILTERS)[number]['key'];

/**
 * The filters that are a *search* rather than a browse.
 *
 * "All" and "Overs" are a reader working through the feed from the top, and the
 * window they see is theirs to extend. A reader who taps "W" is not browsing —
 * they are asking a question about the innings ("what wickets have fallen"), and
 * an answer of three because that is how far the feed has been paged is the
 * wrong answer. These fill themselves instead, walking back until the feed runs
 * out or the budget below is spent.
 */
const SEARCH_FILTERS: ReadonlySet<BallFilter> = new Set([
  'highlights',
  'wickets',
  'sixes',
  'fours',
]);

/**
 * Hard backstop on the walks one of those searches may spend.
 *
 * The real stop is the innings boundary below — this only catches the cases that
 * never reach one: a feed that keeps answering, a match whose first over never
 * arrives. crex hands back ten rows a call, so each walk is several requests and
 * an unbounded loop on a Test with four innings of feed behind it is not a
 * background trickle. Past the budget the reader gets the button back.
 */
const AUTO_WALK_BUDGET = 14;

/** Whether a delivery survives a filter. The `overs` filter keeps none. */
function passesFilter(b: BallEntry, filter: BallFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'highlights':
      return b.isWicket || b.batRuns === 4 || b.batRuns === 6;
    case 'wickets':
      return b.isWicket;
    case 'sixes':
      return b.batRuns === 6;
    case 'fours':
      return b.batRuns === 4;
    case 'overs':
      return false;
  }
}

/**
 * One row of the merged feed: a delivery, or the card that closes an over.
 *
 * `over` is the over as a reader counts it — the 64th over — not crex's ball
 * prefix, which is one lower: their deliveries 63.1 to 63.6 are the 64th over,
 * and the summary row for them is numbered 64. Mixing the two conventions puts
 * every card one over away from the balls it describes, which reads as a card
 * with the wrong figures on it. The header's own ball strip labels its groups the
 * same way — see `overGroupLabel`.
 */
type FeedRow =
  | { kind: 'ball'; key: string; over: number; ball: BallEntry }
  | { kind: 'over'; key: string; over: number; summary: OverSummary };

function CommentaryTab({
  balls,
  summaries,
  pending,
  loadingMore,
  exhausted,
  onLoadMore,
}: {
  /** Deliveries, newest first. */
  balls: BallEntry[];
  /** End-of-over cards from the same walk of the feed, newest first. */
  summaries: OverSummary[];
  /** The feed is still being fetched — show placeholders, not an empty state. */
  pending?: boolean;
  /** A deeper walk of the feed is in flight. */
  loadingMore?: boolean;
  /** The feed has nothing older to hand back. */
  exhausted?: boolean;
  onLoadMore?: () => void;
}) {
  const [filter, setFilter] = useState<BallFilter>('all');
  const [inning, setInning] = useState<number | null>(null);

  // Which innings the feed actually covers. Read off the data rather than the
  // format: a Test three innings in has three chips, and a T20 has one and needs
  // no picker at all.
  const innings = useMemo(() => {
    const seen = new Set<number>();
    for (const b of balls) if (b.inning !== undefined) seen.add(b.inning);
    for (const o of summaries) seen.add(o.inning);
    return [...seen].sort((a, b) => a - b);
  }, [balls, summaries]);

  const rows = useMemo<FeedRow[]>(() => {
    const inScope = (n: number | undefined): boolean => inning === null || n === inning;

    const ballRows: FeedRow[] = balls
      .filter((b) => inScope(b.inning) && passesFilter(b, filter))
      .map((b) => ({ kind: 'ball' as const, key: b.id, over: b.over + 1, ball: b }));

    // Over cards survive every filter but the three that ask for one kind of
    // delivery: a reader who tapped "4s" wants a list of fours, not a list of
    // fours interleaved with summaries of overs that had none.
    const withOvers = filter === 'all' || filter === 'overs' || filter === 'highlights';
    const overRows: FeedRow[] = withOvers
      ? summaries
          .filter((o) => inScope(o.inning))
          .map((o) => ({ kind: 'over' as const, key: `o-${o.id}`, over: o.over, summary: o }))
      : [];

    // Newest first, with an over's card above the deliveries it closes. Innings
    // leads the comparison because both innings of a Test have an over 12, and
    // a window that has been walked past a boundary holds both.
    const inningOf = (row: FeedRow): number =>
      row.kind === 'over' ? row.summary.inning : row.ball.inning ?? 0;

    return [...overRows, ...ballRows].sort(
      (a, b) =>
        inningOf(b) - inningOf(a) ||
        b.over - a.over ||
        (a.kind === b.kind ? 0 : a.kind === 'over' ? -1 : 1) ||
        (a.kind === 'ball' && b.kind === 'ball' ? b.ball.ball - a.ball.ball : 0)
    );
  }, [balls, summaries, filter, inning]);

  // Walks spent filling a search filter. Not reset when the filter changes: the
  // feed they filled is shared, so the budget is about how deep this page has
  // dug in total, not about how deep any one chip dug.
  const autoWalks = useRef(0);
  const searching = SEARCH_FILTERS.has(filter);

  // Where a search stops: the start of the innings it is searching. Reaching the
  // first over means every wicket of it is now on screen, and a walk past it only
  // buys deliveries from the innings before — which is the innings chips' job,
  // not this one's. Crossing the boundary counts as reaching it: the feed hands
  // back ten rows at a time and the last page usually straddles it.
  const reachedInningsStart = useMemo(() => {
    if (!balls.length) return false;
    if (new Set(balls.map((b) => b.inning)).size > 1) return true;
    return Math.min(...balls.map((b) => b.over)) === 0;
  }, [balls]);

  const autoFilling =
    searching && !exhausted && !reachedInningsStart && autoWalks.current < AUTO_WALK_BUDGET;

  useEffect(() => {
    if (!autoFilling || loadingMore || !onLoadMore) return;

    autoWalks.current += 1;
    onLoadMore();
  }, [autoFilling, loadingMore, onLoadMore]);

  // The tail of the feed asks for the next window as it comes into view. The
  // margin is generous so a fast scroll does not stall at the bottom waiting on
  // the request.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const canScrollLoad =
    Boolean(onLoadMore) && !exhausted && !autoFilling && (balls.length > 0 || loadingMore);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !canScrollLoad || loadingMore || !onLoadMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onLoadMore();
      },
      { rootMargin: '400px 0px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [canScrollLoad, loadingMore, onLoadMore, rows.length]);

  // The window the feed actually covers, which is what makes an empty filter
  // honest: "no wickets" is a claim about the whole innings, "no wickets in the
  // 12 overs loaded" is what we know.
  const covered = useMemo(() => {
    // Scoped to the innings on screen. Unscoped, a window walked past a boundary
    // reported "overs 1 to 69" — two innings' worth described as one range, and a
    // "load overs before 1" button under it.
    const scope = inning ?? Math.max(...balls.map((b) => b.inning ?? 0), 0);
    const overs = [
      ...balls.filter((b) => (b.inning ?? 0) === scope).map((b) => b.over + 1),
      ...summaries.filter((o) => o.inning === scope).map((o) => o.over),
    ];
    if (!overs.length) return null;
    return { from: Math.min(...overs), to: Math.max(...overs) };
  }, [balls, summaries, inning]);

  return (
    <div className={styles.panel}>
      <section className={styles.block}>
        <h2 className={styles.blockTitle}>Ball by Ball</h2>

        {/* Two rows of chips: what to show, and which innings to show it from.
            The innings row exists only on a match that has more than one. */}
        <div className={styles.filters} role="group" aria-label="Commentary filters">
          {BALL_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`${styles.filterChip} ${filter === f.key ? styles.filterOn : ''}`}
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {innings.length > 1 && (
          <div className={styles.filters} role="group" aria-label="Innings">
            <button
              type="button"
              className={`${styles.filterChip} ${inning === null ? styles.filterOn : ''}`}
              aria-pressed={inning === null}
              onClick={() => setInning(null)}
            >
              All innings
            </button>
            {innings.map((n) => (
              <button
                key={n}
                type="button"
                className={`${styles.filterChip} ${inning === n ? styles.filterOn : ''}`}
                aria-pressed={inning === n}
                onClick={() => setInning(n)}
              >
                Inn {n + 1}
              </button>
            ))}
          </div>
        )}

        {rows.length ? (
          <div className={styles.commentary}>
            {rows.map((row) =>
              row.kind === 'over' ? (
                <OverCard key={row.key} summary={row.summary} />
              ) : (
                <div key={row.key} className={styles.ballRow}>
                  <span
                    className={`${styles.ballMarker} ${
                      row.ball.isWicket
                        ? styles.wicket
                        : row.ball.batRuns === 4 || row.ball.batRuns === 6
                          ? styles.boundary
                          : row.ball.extra
                            ? styles.extraMarker
                            : ''
                    }`}
                  >
                    {row.ball.over}.{row.ball.ball}
                  </span>
                  <span className={styles.ballText}>{row.ball.text}</span>
                  <span className={styles.ballTail}>
                    {row.ball.scoreAfter && (
                      <span className={styles.ballScore}>{row.ball.scoreAfter}</span>
                    )}
                    <span className={`${styles.ballRuns} ${kindClass(row.ball)}`}>
                      {runsLabel(row.ball)}
                    </span>
                  </span>
                </div>
              )
            )}
          </div>
        ) : pending ? (
          <CommentarySkeleton />
        ) : (
          <p className={styles.empty}>
            {filter === 'all' && inning === null
              ? 'No commentary yet.'
              : covered
                ? `Nothing between overs ${covered.from} and ${covered.to} matches that filter.`
                : 'Nothing in the feed matches that filter.'}
          </p>
        )}

        {/* While a search filter fills itself there is nothing to press, so the
            tail of the list is placeholder rather than a button — the same
            treatment the feed's first load gets. No over card on it: the walk
            has not reached that over yet, and drawing one would promise it. */}
        {autoFilling && (
          <div
            role="status"
            aria-label={
              covered
                ? `Searching the innings, read back to over ${covered.from}`
                : 'Searching the innings'
            }
          >
            <CommentarySkeleton balls={2} card={false} />
          </div>
        )}

        {/* crex serves the feed ten rows at a time, so the innings arrives in
            windows rather than whole. The tail pages itself in as the reader
            reaches it; the sentinel sits below the placeholder so the observer
            still has something to watch while a walk is in flight. */}
        {canScrollLoad && (
          <>
            {loadingMore && (
              <div role="status" aria-label="Loading older overs">
                <CommentarySkeleton balls={2} card={false} />
              </div>
            )}
            <div ref={sentinelRef} className={styles.loadSentinel} aria-hidden="true" />
          </>
        )}
      </section>
    </div>
  );
}

/**
 * The card that closes an over: what it cost, the score it left, who was in and
 * who bowled it.
 *
 * crex's own figures throughout rather than a roll-up of the deliveries on
 * screen — the feed is paged back only a few overs, and summing what we happen
 * to hold would print an over total that disagrees with the card.
 */
function OverCard({ summary }: { summary: OverSummary }) {
  return (
    <article className={styles.overCard}>
      <header className={styles.overCardHead}>
        <h3 className={styles.overCardTitle}>Over {summary.over}</h3>
        <span className={styles.overCardRuns}>
          {summary.runs} run{summary.runs === 1 ? '' : 's'}
          {summary.wickets > 0 && (
            <span className={styles.overCardWickets}>
              {' · '}
              {summary.wickets} wkt{summary.wickets === 1 ? '' : 's'}
            </span>
          )}
        </span>
        {summary.score && (
          <span className={styles.overCardScore}>
            {summary.battingTeam ? `${summary.battingTeam} ` : ''}
            {summary.score}
          </span>
        )}
      </header>

      {summary.balls.length > 0 && (
        <ol className={styles.overCardBalls} aria-label={`Over ${summary.over} ball by ball`}>
          {summary.balls.map((b, i) => (
            <li key={i} className={`${styles.overCardBall} ${overBallClass(b)}`}>
              {b}
            </li>
          ))}
        </ol>
      )}

      <dl className={styles.overCardPlayers}>
        {summary.batsmen.map((b) => (
          <div key={b.name} className={styles.overCardPlayer}>
            <dt>
              <PlayerLink id={b.playerId ?? undefined} name={b.name} />
            </dt>
            <dd>{b.figures}</dd>
          </div>
        ))}
        {summary.bowler && (
          <div className={`${styles.overCardPlayer} ${styles.overCardBowler}`}>
            <dt>
              <PlayerLink
                id={summary.bowler.playerId ?? undefined}
                name={summary.bowler.name}
              />
            </dt>
            <dd>{summary.bowler.figures}</dd>
          </div>
        )}
      </dl>
    </article>
  );
}

/**
 * The tone of one token in an over's ball strip.
 *
 * crex sends the over's deliveries as its own shorthand — "1", "0", "W", "4",
 * "wd" — so these are matched as text rather than parsed: the strip prints the
 * token as sent, and this only decides what colour it prints in.
 */
function overBallClass(token: string): string {
  const t = token.toUpperCase();
  if (t === 'W' || t.endsWith('W')) return styles.overBallWicket;
  if (t.startsWith('6')) return styles.overBallSix;
  if (t.startsWith('4')) return styles.overBallFour;
  if (t === '0') return styles.overBallDot;
  if (/[A-Z]/.test(t)) return styles.overBallExtra;
  return '';
}
