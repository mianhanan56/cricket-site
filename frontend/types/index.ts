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

// The player entity and its batting/bowling stat blocks lived here, describing
// the DB's Player table. There is still no player *corpus* — crex has no search
// endpoint, so nothing can enumerate players — but a single player, by key, is
// now readable: see PlayerProfile at the foot of this file.

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
  squads?: MatchSquads | null;
  /** Player of the match. Null until crex names one, which it does once the match is over. */
  playerOfMatch?: PlayerOfMatch | null;
}

// One entry of a team's recent-results strip (most recent first).
export interface TeamFormEntry {
  matchId: string;
  result: 'W' | 'L' | 'D';
  opponent: string; // opponent short name
}

/**
 * The match award, as crex reports it: the player, the side they played for, and
 * whichever of their two figures they earned it with. A specialist gets one of
 * the two — a batter has no bowling line to show — so both are nullable.
 */
export interface PlayerOfMatch {
  id: string;
  name: string;
  /** Team f_key, so the caller can name the side without a second lookup. */
  teamId: string;
  teamShortName: string;
  /** Batting figures, crex's own notation: "65(36)", or "78(121)*" unbeaten. */
  batting: string | null;
  /** Bowling figures, wickets first: "3/30". */
  bowling: string | null;
}

/** Both squads for a match, home side first — what the match page renders. */
export interface MatchSquads {
  home: SquadPlayer[];
  away: SquadPlayer[];
}

export interface SquadPlayer {
  id: string;
  name: string;
  role: PlayerRole;
  /** Leads the side. Marked on the name rather than in `role`, which a captain shares with the rest of the XI. */
  isCaptain?: boolean;
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

// ---------------------------------------------------------------------------
// Player profile
// ---------------------------------------------------------------------------
//
// One player, by crex f_key — the key already on every scorecard line, squad
// member and ranking row, so every name the app prints can now open a page.
//
// Two shapes worth explaining before the fields:
//
//   *Format* here is a label, not the three-way MatchFormat enum. crex reports a
//   career per competition — Test, ODI and T20I alongside the IPL, the PSL, the
//   T20 Blast — and a batter's IPL record is not an entry in a TEST|ODI|T20
//   union. The label is decoded from crex's own pair of codes; see
//   `playerFormatLabel` in lib/crex.
//
//   *Figures* on a form entry arrive composed ("22 (34)", "3-41") rather than as
//   parts. The two disciplines read differently — runs off balls faced, wickets
//   for runs conceded — and one field that already says which is cheaper for
//   every consumer than a union they each have to re-render.

/** crex's own word for what a player is, from `rl` on the profile. */
export type PlayerRoleLabel = 'Batter' | 'Bowler' | 'All Rounder' | 'Wicket-keeper';

/** A batting career in one competition and format. */
export interface PlayerBattingCareer {
  /** Display label — "Test", "ODI", "T20I", "IPL", "T20-Blast". */
  format: string;
  /**
   * Played for a country rather than a club. crex groups its own tables this
   * way and it is the split that matters: 1,300 T20 Blast runs and 1,300 Test
   * runs are not the same achievement, and averaging them together says nothing.
   */
  international: boolean;
  matches: number;
  innings: number;
  runs: number;
  hundreds: number;
  fifties: number;
  highScore: number;
  strikeRate: number;
  average: number;
  fours: number;
  sixes: number;
  /** crex sends this only on some formats; null where it does not. */
  ducks: number | null;
  /** The match the highest score was made in, so the innings can be opened. */
  highScoreMatchId: string | null;
}

/** A bowling career in one competition and format. */
export interface PlayerBowlingCareer {
  format: string;
  /** See PlayerBattingCareer.international. */
  international: boolean;
  matches: number;
  innings: number;
  wickets: number;
  economy: number;
  average: number;
  /** Best innings figures, crex's notation: "5/23". Null when they have none. */
  best: string | null;
  threeWickets: number;
  fiveWickets: number;
  strikeRate: number;
}

/** One of a player's last ten innings, batting or bowling. */
export interface PlayerFormEntry {
  /** "22 (34)" batting, "3-41" bowling — wickets first, as crex prints it. */
  figures: string;
  /** Batting only: they were still in at the end. */
  notOut: boolean;
  /** "PAK vs ENG", the player's side first. */
  fixture: string;
  /** Competition label, or null when crex has no code for it. */
  format: string | null;
  /** crex match key, so the innings can link to the match. Null when absent. */
  matchId: string | null;
  date: string | null; // ISO string
}

/** A live ICC ranking position, as the profile header prints it. */
export interface PlayerRanking {
  format: string;
  position: number;
  discipline: 'Batter' | 'Bowler' | 'All Rounder';
}

/** When a player first played a format, in crex's own prose. */
export interface PlayerDebut {
  format: string;
  /** "England v South Africa Kennington Oval, London, 8-9-2022". */
  fixture: string;
  /** The debut match itself, where crex still keys it. */
  matchId: string | null;
}

export interface PlayerProfile {
  /** crex f_key — what the page is routed by. */
  id: string;
  name: string;
  /** Illustrated portrait crex serves off Akamai. Always built; may 404. */
  image: string | null;
  role: PlayerRoleLabel;
  gender: 'Male' | 'Female';
  dateOfBirth: string | null; // ISO string
  /** Years, at today's date. Null when crex has no date of birth. */
  age: number | null;
  birthPlace: string | null;
  height: string | null;
  nationality: string | null;
  /** "right handed · opener" — hand and position, as crex pairs them. */
  bats: string | null;
  /** "right-arm offbreak · spinner". Null for a player who does not bowl. */
  bowls: string | null;
  /** Their signature shot, when crex names one. Rarely filled in. */
  popularShot: string | null;
  /** Every side they have played for, most senior first — crex's own order. */
  teams: string[];
  /** National side's f_key, for the crest beside the name. */
  countryKey: string | null;
  countryShortName: string | null;
  /**
   * Editorial bio, sanitised to a handful of tags with every attribute dropped
   * — crex sends Google-Docs HTML, inline styles and all. Null when unwritten.
   */
  bio: string | null;
  instagram: string | null;
  twitter: string | null;
  rankings: PlayerRanking[];
  batting: PlayerBattingCareer[];
  bowling: PlayerBowlingCareer[];
  recentBatting: PlayerFormEntry[];
  recentBowling: PlayerFormEntry[];
  debuts: PlayerDebut[];
}
