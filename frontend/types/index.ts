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
  /**
   * crex venue f_key, so the ground is a link and not just a caption. Null on a
   * fixture crex has not allocated a venue to yet ("TBD"), which is most of a
   * league's playoff stage.
   */
  venueId?: string | null;
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
  /** The same number split into byes / leg-byes / wides / no-balls / penalty. */
  extrasBreakdown?: ExtrasBreakdown;
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

/**
 * The five extras lines, as crex publishes them. Kept alongside the total so
 * the card can say *which* extras made up the number — a nine made of wides
 * reads very differently to one made of byes.
 */
export interface ExtrasBreakdown {
  byes: number;
  legByes: number;
  wides: number;
  noBalls: number;
  penalty: number;
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
  extrasBreakdown?: ExtrasBreakdown;
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

// Also gone from here, shapes only the old backend ever produced: the news
// article (there is no news source), the win-probability record (the widget
// computes its own from the card — see components/match/WinProbability), and the
// API-envelope and Socket.io payload types. The points table was in this list
// too, on the belief that crex served no standings. It does —
// `seriesInside/getPTableForSeriesID` — so the real shape is below. Nothing speaks that protocol now: every source is the
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

// ---------------------------------------------------------------------------
// Standings
// ---------------------------------------------------------------------------
//
// A league page without a table is a list of results the reader has to add up
// themselves, which is the one thing standings exist to stop.
//
// Modelled as *groups*, not as a table, because crex sends groups: a league
// answers with one, a World Cup group stage with one per group. A single flat
// table would silently merge Group A and Group B into a standing that describes
// no competition at all.

/** One side's line in a points table. */
export interface PointsTableRow {
  /** crex team f_key — what the crest and the team page are keyed by. */
  teamKey: string;
  team: ITeam;
  /** crex's own position, which is not the order the rows arrive in. */
  rank: number;
  played: number;
  won: number;
  lost: number;
  /**
   * Abandoned or washed out — a point each, and the reason W+L ≠ P. Null on a
   * table that has no such column: crex sends `NR` on a limited-overs table and
   * `Draw` on a Test one, never both, so the two are carried separately and the
   * table draws whichever column it was actually given.
   */
  noResult: number | null;
  /** Drawn — Test tables only. Null on a limited-overs table. */
  drawn: number | null;
  points: number;
  /**
   * Net run rate, kept as crex's own signed string ("+1.805", "-0.119") rather
   * than a number. It is a printed figure with a mandatory sign and exactly
   * three decimals; re-deriving that from a float only loses the "+".
   *
   * Null where the format has no such figure — a Test table, where crex fills
   * the field with a bare "0" that would otherwise print as a real run rate of
   * zero.
   */
  netRunRate: string | null;
  /** Last five results, oldest first. `N` is a no-result. */
  form: Array<'W' | 'L' | 'N'>;
  /** Through to the knockouts. */
  qualified: boolean;
  eliminated: boolean;
  /** Won the thing. Drawn as a mark on the row, not as a status. */
  champion: boolean;
}

export interface PointsTableGroup {
  /**
   * Group name, or null on a single-table league. crex sends the competition's
   * own name there, which as a heading above one table is just the page title
   * again — so it is dropped rather than printed twice.
   */
  name: string | null;
  /**
   * Three or more sides — a competition that awards points, so the Pts column
   * means something.
   *
   * False on a bilateral series, where the table is a scoreline: England and
   * Pakistan playing three Tests have wins, losses and draws but no competition
   * points, and crex's `Pts` field is a column of zeros there. The table still
   * renders; the points column does not.
   */
  tournament: boolean;
  rows: PointsTableRow[];
}

// ---------------------------------------------------------------------------
// Series leaders
// ---------------------------------------------------------------------------
//
// The tournament's own honours board — who has the most runs, the most wickets,
// the highest score. crex answers this from one block of its series overview
// (`i4`), one leader per category, and a series page needs it for the reason a
// reader opens one mid-tournament: the table says which side is winning, this
// says who is.

/** Which honour a leader holds. The order here is the order they are shown in. */
export type SeriesLeaderKind =
  | 'RUNS'
  | 'WICKETS'
  | 'HIGHEST_SCORE'
  | 'BEST_FIGURES'
  | 'SIXES'
  | 'FOURS'
  | 'STRIKE_RATE'
  | 'ECONOMY'
  | 'DOTS'
  | 'FANTASY';

/** One player at the top of one category. */
export interface SeriesLeader {
  kind: SeriesLeaderKind;
  /** Printed heading — "Most runs", "Best figures". */
  label: string;
  /**
   * The headline figure, kept as a string: crex sends "17/5" for figures and
   * "169.79" for a rate, and both are printed as given rather than re-derived.
   */
  value: string;
  /** crex player f_key — the link to the profile and the key the portrait uses. */
  playerKey: string;
  playerName: string;
  /** crex's illustrated portrait, or null where the player has none. */
  playerImage: string | null;
  team: ITeam;
  /** Innings batted or bowled in, where crex says. */
  innings: number | null;
  /**
   * The second figure that qualifies the first — a strike rate under a run
   * tally, the runs a strike rate came off, the wickets an economy was taken at.
   * Null where the category has none.
   */
  support: string | null;
}

/** A tournament's honours board, plus the two totals crex sends with it. */
export interface SeriesLeaders {
  leaders: SeriesLeader[];
  /** Fours hit in the whole tournament. Null where crex sends no total. */
  fours: number | null;
  sixes: number | null;
}

// ---------------------------------------------------------------------------
// Series stat tables
// ---------------------------------------------------------------------------
//
// The full ranking behind each honour — the top ten run scorers in a
// tournament, with the innings, average and strike rate that produced them.
//
// Derived, not fetched: crex has no series-leaderboard endpoint (their own page
// builds it from a GraphQL id space that nothing in the public payloads
// resolves). Every scorecard in the series is public, though, and a scorecard
// carries every column this table needs, so the ranking is aggregated from them.

/** Which ranking a table holds. */
export type SeriesStatKind =
  | 'RUNS'
  | 'WICKETS'
  | 'HIGHEST_SCORE'
  | 'BEST_FIGURES'
  | 'SIXES'
  | 'FOURS'
  | 'STRIKE_RATE'
  | 'ECONOMY'
  | 'FIFTIES'
  | 'HUNDREDS';

/** A player's batting across the whole series. */
export interface SeriesBattingTotals {
  matches: number;
  innings: number;
  runs: number;
  balls: number;
  /** Highest score, with a `*` where it was unbeaten. */
  highest: string;
  notOuts: number;
  /** Null for a batter never dismissed — an average of ∞, not of zero. */
  average: number | null;
  strikeRate: number | null;
  fours: number;
  sixes: number;
  fifties: number;
  hundreds: number;
}

/** A player's bowling across the whole series. */
export interface SeriesBowlingTotals {
  matches: number;
  innings: number;
  overs: number;
  runs: number;
  wickets: number;
  /** Best innings figures, wickets first — "5/19". */
  best: string;
  average: number | null;
  economy: number | null;
  /** Balls per wicket. Null where nobody was dismissed. */
  strikeRate: number | null;
  fiveFors: number;
}

export interface SeriesStatRow {
  rank: number;
  playerKey: string;
  playerName: string;
  playerImage: string | null;
  team: ITeam;
  /** The figure the table is ranked by, printed as it should read. */
  value: string;
  batting: SeriesBattingTotals;
  bowling: SeriesBowlingTotals;
}

export interface SeriesStatTable {
  kind: SeriesStatKind;
  /** "Most runs", "Best figures". */
  label: string;
  /** Which set of columns the table draws. */
  discipline: 'BATTING' | 'BOWLING';
  rows: SeriesStatRow[];
  /** How many matches the figures were read off — the table's own footnote. */
  matchesCounted: number;
  /**
   * The minimum that had to be met to appear, on the rate tables. Null on the
   * counting tables, which have no cut.
   */
  qualifier: string | null;
}

// ---------------------------------------------------------------------------
// Head to head
// ---------------------------------------------------------------------------
//
// Derived, not fetched: crex has no h2h endpoint, but its schedule rows carry a
// result *sentence*, and a sentence is enough. "won by 6 wickets" means the
// winner batted second; "won by 34 runs" means they batted first. So a record
// and a chased/defended split both fall out of text already on the wire.

/** One previous meeting between two sides. */
export interface HeadToHeadMatch {
  /** Match key, or null where crex never allocated one. */
  id: string | null;
  /** Stable list key — the match key or the fixture's slot. */
  key: string;
  startTime: string;
  venue: string;
  format: MatchFormat;
  series: string;
  /** crex's own sentence: "Guyana Amazon Warriors won by 5 wickets". */
  result: string;
  /**
   * f_key of the side that won, when the result names one. Null on a draw, a
   * tie, a no-result — and on a win crex worded in a way this cannot attribute,
   * which is why the record below counts `unresolved` separately rather than
   * quietly filing those as draws.
   */
  winnerKey: string | null;
}

export interface HeadToHead {
  /** The two sides, in the order the caller asked for them. */
  home: ITeam;
  away: ITeam;
  played: number;
  homeWins: number;
  awayWins: number;
  /** Drawn, tied or abandoned. */
  drawn: number;
  /**
   * Meetings whose result text names no side this could match. Surfaced rather
   * than absorbed: a record of 3–2 out of 8 meetings is honest, and 3–2 out of 5
   * would not be.
   */
  unresolved: number;
  /** Most recent first. */
  matches: HeadToHeadMatch[];
}

// ---------------------------------------------------------------------------
// Venues
// ---------------------------------------------------------------------------

/**
 * What a ground has done lately.
 *
 * Every figure here comes from schedule rows — team keys, scores and the result
 * sentence — so the page can only ever describe the window those rows cover, and
 * says so. Deliberately absent: an average first-innings score. The rows carry
 * `s1`/`s2` by *team*, not by innings, so which of the two batted first is only
 * knowable from the result wording, and only on the matches that were won rather
 * than drawn. A "venue average" built on that subset would be a number with a
 * silent asterisk.
 */
export interface VenueProfile {
  /** crex venue f_key. */
  id: string;
  name: string;
  /**
   * The most recent finished matches, newest first — a **slice** for display,
   * not the whole set. Use `playedCount` for the figure: the chase/defend split
   * below is counted over every finished match in the window, so a header built
   * on `played.length` disagrees with it the moment the window holds more
   * matches than the list shows.
   */
  played: HeadToHeadMatch[];
  /** Finished matches in the window — the real total, not the slice's length. */
  playedCount: number;
  upcoming: IMatch[];
  /** Scheduled matches in the window. `upcoming` is a slice of these. */
  upcomingCount: number;
  /** Won by the side batting second. */
  chased: number;
  /** Won by the side batting first. */
  defended: number;
  /** Neither — drawn, tied, abandoned, or a result this cannot attribute. */
  inconclusive: number;
  /** Sides that have played here most in the window, busiest first. */
  regulars: Array<{ team: ITeam; matches: number }>;
}

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

/**
 * crex's own colours for a side, off the mapping response. Three values, and the
 * useful one is not the first: `cc` arrives as "0-#8F65E6" — a leading mode flag
 * and a hex — while `uc` and `dc` are plain hex. They are what makes a team page
 * look like that team rather than like the site's accent again.
 */
export interface TeamColors {
  primary: string | null;
  secondary: string | null;
  dark: string | null;
}

export interface TeamRankingPosition {
  format: RankingFormat;
  gender: RankingGender;
  position: number;
  rating: number;
}

export interface TeamProfile {
  team: ITeam;
  colors: TeamColors;
  /** ICC position per format, where the side is ranked at all. */
  rankings: TeamRankingPosition[];
  /** Scheduled matches, soonest first. */
  upcoming: IMatch[];
  /** Finished matches, most recent first, with the outcome attributed. */
  recent: HeadToHeadMatch[];
  /** Last five results, most recent first. */
  form: Array<'W' | 'L' | 'N'>;
  /** Named squad, from the current competition. Empty when none is announced. */
  squad: SquadPlayer[];
  /** The competition that squad was named for. */
  squadSeries: { id: string; name: string } | null;
}
