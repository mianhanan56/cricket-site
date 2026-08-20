'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  BallExtra,
  Match,
  MatchEvent,
  Team,
  InningsScore,
  BatsmanLine,
  BowlerLine,
  CommentaryBall,
  TeamFormEntry,
  MatchSquads,
  PlayerOfMatch,
  PlayerRole,
  SquadPlayer,
} from '@/types';
import {
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
import { isStaleStoppage } from '@/lib/crex';
import { PlayerSituations, pausedWord } from './MatchState';
import MatchEvents from './MatchEvents';
import WinProbability from './WinProbability';
import {
  BowlingSkeleton,
  CommentarySkeleton,
  ScorecardSkeleton,
} from './MatchDetailSkeleton';
import styles from './MatchDetail.module.scss';

type TabKey = 'info' | 'scorecard' | 'commentary';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'info', label: 'Match Info' },
  { key: 'scorecard', label: 'Scorecard' },
  { key: 'commentary', label: 'Commentary' },
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

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function dismissalOf(b: BatsmanLine): string {
  if (b.dismissal) return b.dismissal;
  return b.out ? 'out' : 'not out';
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
}: {
  matchId: string;
  initial: Match;
}) {
  const [match, setMatch] = useState<Match>(initial);
  const [tab, setTab] = useState<TabKey>('info');

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
  const { match: polled, lastUpdated } = useCrexMatch(matchId, {
    initial,
    enabled: match.status === 'LIVE',
  });

  // Scorecard + ball-by-ball, but only while the match is live or recently
  // finished — an upcoming fixture has neither.
  const extrasEnabled = match.status !== 'UPCOMING';
  const crexExtras = useCrexMatchExtras(matchId, {
    enabled: extrasEnabled,
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
  // Fetched only before the match starts, which is both where it is needed and
  // the only place crex's squad field can be trusted: once play is on it holds a
  // pruned list rather than the XI (see `getCrexMatchSquads`), and from the
  // first ball the scorecard names everyone anyway.
  const { squads: squadsByTeam } = useCrexMatchSquads(matchId, {
    enabled: match.status === 'UPCOMING',
  });
  const squads = useMemo(() => {
    const home = squadsByTeam[match.homeTeam.id] ?? match.squads?.home ?? [];
    const away = squadsByTeam[match.awayTeam.id] ?? match.squads?.away ?? [];
    return home.length || away.length ? { home, away } : null;
  }, [squadsByTeam, match.homeTeam.id, match.awayTeam.id, match.squads]);

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

  // Commentary grouped by over, newest over first (entries are newest-first).
  const overs = useMemo(() => {
    const map = new Map<number, BallEntry[]>();
    for (const b of commentary) {
      const group = map.get(b.over);
      if (group) group.push(b);
      else map.set(b.over, [b]);
    }
    return [...map.entries()].sort((a, b) => b[0] - a[0]);
  }, [commentary]);

  return (
    <div className={styles.page}>
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
                {lastBall.over}.{lastBall.ball}
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
                    </span>
                  </li>
                </ul>
              </div>
            )}
          </div>
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
            match.format,
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
        {TABS.map((t) => (
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
        <CommentaryTab overs={overs} pending={extrasPending} />
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
  pending,
}: {
  match: Match;
  events: MatchEvent[];
  /** The fetched card, for the retired-hurt lines. */
  innings: InningsScore[];
  /** Announced squads, or null while crex has none. */
  squads: MatchSquads | null;
  pending?: boolean;
}) {
  const details: Array<[string, string]> = [
    ['Date', fmtDate(match.startTime)],
    ['Time', fmtTime(match.startTime)],
    ['Venue', match.venue],
    ['Format', match.format],
    ['Series', match.series.name],
  ];

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

      {match.teamForm && (
        <section className={styles.block}>
          <h2 className={styles.blockTitle}>Team Form <span className={styles.blockHint}>last 5</span></h2>
          <FormStrip team={match.homeTeam} form={match.teamForm.home} />
          <FormStrip team={match.awayTeam} form={match.teamForm.away} />
        </section>
      )}

      {squads && (
        <section className={styles.block}>
          <h2 className={styles.squadsTitle}>Squads</h2>
          <div className={styles.squads}>
            <SquadColumn team={match.homeTeam} players={squads.home} />
            <SquadColumn team={match.awayTeam} players={squads.away} />
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
    </div>
  );
}

// ----------------------------------------------------------------- Scorecard

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
  const yetToBat = current?.yetToBat ?? [];

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
                  {inn.inning ?? `${inn.teamShortName} — Innings ${i + 1}`}
                </button>
              ))}
            </div>
          ) : (
            <h2 className={styles.inningsName}>
              {current.inning ?? `${current.teamShortName} — Innings 1`}
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
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.left}>Batsman</th>
                  <th className={styles.left}>How Out</th>
                  <th>R</th>
                  <th>B</th>
                  <th>4s</th>
                  <th>6s</th>
                  <th>SR</th>
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
                    <td colSpan={4} />
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
          </div>
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
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.left}>Bowler</th>
                  <th>{isHundred ? 'B' : 'O'}</th>
                  <th>M</th>
                  <th>R</th>
                  <th>W</th>
                  <th>Econ</th>
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
          </div>
        ) : pending ? (
          <BowlingSkeleton />
        ) : (
          <p className={styles.empty}>No bowling data yet.</p>
        )}
      </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Commentary

function CommentaryTab({
  overs,
  pending,
}: {
  overs: Array<[number, BallEntry[]]>;
  /** The feed is still being fetched — show placeholders, not an empty state. */
  pending?: boolean;
}) {
  return (
    <div className={styles.panel}>
      <section className={styles.block}>
        <h2 className={styles.blockTitle}>Ball by Ball</h2>
        {overs.length ? (
          <div className={styles.commentary}>
            {overs.map(([over, balls]) => (
              <div key={over} className={styles.overGroup}>
                <h3 className={styles.overHeader}>Over {over}</h3>
                <ul>
                  {balls.map((b) => (
                    <li key={b.id} className={styles.ballRow}>
                      <span
                        className={`${styles.ballMarker} ${
                          b.isWicket
                            ? styles.wicket
                            : b.batRuns === 4 || b.batRuns === 6
                              ? styles.boundary
                              : b.extra
                                ? styles.extraMarker
                                : ''
                        }`}
                      >
                        {b.over}.{b.ball}
                      </span>
                      <span className={styles.ballText}>{b.text}</span>
                      <span className={`${styles.ballRuns} ${kindClass(b)}`}>
                        {runsLabel(b)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : pending ? (
          <CommentarySkeleton />
        ) : (
          <p className={styles.empty}>No commentary yet.</p>
        )}
      </section>
    </div>
  );
}
