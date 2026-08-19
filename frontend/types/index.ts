// ============================================================================
// PulseCrease — Frontend TypeScript types
// Owned by the frontend. Import from '@/types'.
// ============================================================================

export type MatchFormat = 'TEST' | 'ODI' | 'T20';
export type MatchStatus = 'LIVE' | 'UPCOMING' | 'COMPLETED';
export type PlayerRole = 'BATSMAN' | 'BOWLER' | 'ALL_ROUNDER' | 'WK';

// ---------------------------------------------------------------------------
// Core entities (canonical `I`-prefixed interfaces)
// ---------------------------------------------------------------------------

export interface ITeam {
  id: string;
  name: string;
  shortName: string;
  country: string;
  logo?: string | null;
}

export interface ISeries {
  id: string;
  name: string;
  startDate: string; // ISO string
  endDate: string;
  format: MatchFormat;
}

// Series list-row enrichment from GET /api/series: a match count and a status
// derived from the series' matches (LIVE > UPCOMING > COMPLETED).
export interface ISeriesSummary extends ISeries {
  status: MatchStatus;
  matchCount: number;
  /**
   * How many of `matchCount` are already played. Only present when the figures
   * come from a series' full schedule — a rollup of the live match feed has no
   * way to know what happened before its window.
   */
  playedCount?: number;
}

// The player entity and its batting/bowling stat blocks lived here. They
// described the DB's Player table; crex has no player corpus we can read (its
// player endpoint is payload-blocked — see lib/search), so nothing builds one.
// Squad members are the only players the app names, and SquadPlayer is enough
// for that.

export interface IMatch {
  id: string;
  homeTeam: ITeam;
  awayTeam: ITeam;
  series: Pick<ISeries, 'id' | 'name'>;
  format: MatchFormat;
  status: MatchStatus;
  venue: string;
  startTime: string; // ISO string
  /** 6 everywhere except The Hundred, which crex scores in sets of 5. */
  ballsPerOver?: number;
  /**
   * Balls in an innings when the format fixes that instead of an over count —
   * 100 on The Hundred. Null/absent means the limit is the format's over count
   * (50 or 20), or that there isn't one (Test).
   */
  ballsLimit?: number | null;
  result?: string | null;
  /**
   * Official in-match state beyond `status` — the break, delay or stumps note
   * crex is currently reporting. Null when play is simply going on.
   */
  note?: MatchNote | null;
  /**
   * Day of play, 1-based, on a format that has more than one. Null on ODIs and
   * T20s, which are always day 1 and where showing it would be noise.
   */
  day?: number | null;
  scorecard?: IScorecard | null;
  // Enrichments attached by GET /api/matches/:id (computed from the DB).
  teamForm?: { home: TeamFormEntry[]; away: TeamFormEntry[] } | null;
  squads?: { home: SquadPlayer[]; away: SquadPlayer[] } | null;
}

// One entry of a team's recent-results strip (most recent first).
export interface TeamFormEntry {
  matchId: string;
  result: 'W' | 'L' | 'D';
  opponent: string; // opponent short name
}

export interface SquadPlayer {
  id: string;
  name: string;
  role: PlayerRole;
}

// Non-prefixed aliases — convenient short names used across the app. The
// `I`-prefixed interfaces above are the canonical source of truth.
export type Team = ITeam;
export type SeriesSummary = ISeriesSummary;
export type Match = IMatch;

// ---------------------------------------------------------------------------
// In-match state: breaks, interruptions and events
// ---------------------------------------------------------------------------
//
// LIVE / UPCOMING / COMPLETED answers "is this match on", and nothing more. A
// reader watching a live page needs the next question answered too: play has
// stopped — is that drinks, is it rain, is it the end of the day, or is it over?
// crex sends that as a status code on the match feed, and these types carry it.

/**
 * Why play is stopped, or what the match state is beyond the three statuses.
 *
 * The kinds are display groupings, not crex codes: several codes share one
 * (rain, bad light and a wet outfield are all `DELAY`) because a reader wants
 * the same thing from all of them — the label, and the fact that nobody is
 * batting right now.
 */
export type MatchNoteKind =
  /** Scheduled interval: innings break, drinks, lunch, tea. */
  | 'BREAK'
  /** A day's play is over. The match is not — Tests only. */
  | 'STUMPS'
  /** Unscheduled hold-up: rain, bad light, wet outfield, a delayed toss. */
  | 'DELAY'
  /** Play has stopped and may not resume: paused, cancelled, abandoned. */
  | 'SUSPENDED'
  /** Toss result, before the first ball. */
  | 'TOSS'
  /** A terminal state that is not a win: drawn, tied, no result, super over. */
  | 'RESULT'
  /** Something crex reported that this vocabulary has no code for. */
  | 'INFO';

export interface MatchNote {
  /** crex's own wording — "Drinks Break", "Stumps", "Match paused due to rain". */
  label: string;
  kind: MatchNoteKind;
  /** Qualifier crex sends alongside the status, e.g. "(wet outfield)". */
  detail?: string | null;
  /**
   * Play is stopped but the match is still alive. The one flag the UI needs to
   * say "paused" rather than "in progress" without re-reading the kind, and what
   * keeps a Test at stumps from reading as finished.
   */
  paused: boolean;
}

/** Where an innings sits in the match. Tests are the only format with four. */
export type InningsPhase = 'COMPLETED' | 'CURRENT' | 'UPCOMING';

/** A discrete thing that happened, as the ball feed reported it. */
export type MatchEventKind =
  | 'WICKET'
  | 'OVER'
  | 'INNINGS_END'
  | 'TARGET'
  | 'TOSS'
  | 'MILESTONE'
  | 'REVIEW'
  | 'PLAYER'
  | 'NOTE';

export interface MatchEvent {
  id: string;
  kind: MatchEventKind;
  /** Short heading — "Wicket", "End of over 22". */
  label: string;
  /** crex's own sentence about it, when it sent one. Never synthesised. */
  text?: string | null;
  /** Over the event belongs to, when the feed says. */
  over?: number | null;
  timestamp?: string;
}

/**
 * A batsman who left the middle without being dismissed. crex has a dismissal
 * code for each, so these are read off the card rather than inferred from prose.
 */
export type RetirementKind = 'HURT' | 'ABSENT' | 'OUT';

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export interface InningsScore {
  teamId?: string; // absent on CricAPI-synced data — match via `inning` label
  teamShortName: string;
  inning?: string; // CricAPI innings label, e.g. "India Inning 1"
  runs: number;
  wickets: number;
  overs: number;
  // Optional per-innings lines; falls back to the top-level (current innings)
  // batting/bowling arrays when absent.
  batting?: BatsmanLine[];
  bowling?: BowlerLine[];
  extras?: number;
  /** XI members who have not batted yet, in card order. */
  yetToBat?: YetToBat[];
  /** The side is listed but has not batted — treat the 0/0 total as no score. */
  notStarted?: boolean;
  /**
   * Which of the batting side's innings this is, 1-based. Only ever 2 in a
   * Test; absent where the source does not say.
   */
  inningsNumber?: number;
  /** Closed by a declaration rather than by ten wickets or an over limit. */
  declared?: boolean;
  /**
   * Completed, in progress, or still to come. Lets a Test card show three
   * innings at once without the reader having to work out which is live.
   */
  phase?: InningsPhase;
}

export interface YetToBat {
  playerId: string;
  name: string;
}

export interface BatsmanLine {
  playerId: string;
  name: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  strikeRate: number;
  out?: boolean;
  dismissal?: string;
  /**
   * Set when the batsman left the middle without being dismissed — `HURT` and
   * `ABSENT` are the injury signals crex actually publishes, `OUT` a tactical
   * retirement. `out` stays false for all three; this says which it was.
   */
  retired?: RetirementKind;
}

export interface BowlerLine {
  playerId: string;
  name: string;
  overs: number;
  maidens: number;
  runs: number;
  wickets: number;
  economy: number;
}

/**
 * `currentInnings`, `target` and `requiredRunRate` were fields here. No source
 * sets them: crex's card is a list of innings and nothing else, so the innings in
 * progress is the last one that has batted and a target is the first innings'
 * total plus one. Both are derived where they are needed (lib/overs'
 * `inningsBallLimit`, MatchDetail's `computeRates`) rather than carried as
 * fields nothing fills in.
 */
export interface IScorecard {
  innings: InningsScore[];
  batting?: BatsmanLine[];
  bowling?: BowlerLine[];
  extras?: number;
  commentary?: CommentaryBall[];
  /** Non-delivery events from the ball feed, newest first. */
  events?: MatchEvent[];
}

/**
 * Extra charged on a delivery, when the feed marks one. `wide` and `noball` are
 * illegal deliveries — they carry a one-run penalty and do not advance the
 * over — while `bye` and `legbye` are legal balls whose runs miss the bat.
 */
export type BallExtra = 'wide' | 'noball' | 'bye' | 'legbye';

export interface CommentaryBall {
  id: string;
  over: number;
  ball: number;
  /** Everything the delivery cost: bat runs + extras, penalty included. */
  runs: number;
  /** Runs off the bat. */
  batRuns: number;
  /** Runs charged as extras, including the wide/no-ball penalty itself. */
  extraRuns: number;
  extra: BallExtra | null;
  isWicket: boolean;
  isBoundary?: boolean;
  text: string;
  timestamp?: string;
}

export type RankingRole = 'BATTING' | 'BOWLING' | 'ALLROUNDER';
export type RankingGender = 'MEN' | 'WOMEN';
export type RankingFormat = 'TEST' | 'ODI' | 'T20I';

export interface RankingEntry {
  id: string;
  playerName: string;
  country: string;
  format: RankingFormat;
  role: RankingRole;
  gender: RankingGender;
  points: number;
  rating: number;
  position: number;
  /**
   * Position on the previous list, when the source knows it. Absent on the
   * bundled snapshot, which stores order and nothing about how it got there —
   * so the movement indicator is drawn only when this is a number, rather than
   * defaulting to "no change" and asserting something we don't know.
   */
  previousPosition?: number;
}

/**
 * One row of an ICC *team* ranking list.
 *
 * Deliberately not a `RankingEntry` with the player fields blanked: a team row
 * carries two facts a player row has no equivalent of — `matches` and `points`,
 * from which the rating is the quotient — and rendering it means a crest rather
 * than a name and a country. Folding the two together would give every consumer
 * a type where half the fields are conditionally meaningless.
 */
export interface TeamRankingEntry {
  id: string;
  /** crex f_key — also what the crest URL is built from. */
  teamKey: string;
  teamName: string;
  shortName: string;
  logo: string | null;
  format: RankingFormat;
  gender: RankingGender;
  /** Rating points accumulated over `matches`. */
  points: number;
  /** points / matches, as the ICC publishes it. */
  rating: number;
  matches: number;
  position: number;
}

// Also gone from here, all of them shapes only the old backend ever produced:
// the news article (there is no news source), the points table (crex serves no
// standings), the win-probability record (the widget computes its own from the
// card — see components/match/WinProbability), and the API-envelope and
// Socket.io payload types. Nothing speaks that protocol now: every source is the
// crex Worker, which returns plain JSON over HTTP.
