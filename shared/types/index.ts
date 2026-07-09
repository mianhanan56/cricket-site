// ============================================================================
// PulseCrease — Shared TypeScript types
// Imported by both `frontend` and `backend`. Keep framework-agnostic.
// ============================================================================

export type MatchFormat = 'TEST' | 'ODI' | 'T20';
export type MatchStatus = 'LIVE' | 'UPCOMING' | 'COMPLETED';
export type PlayerRole = 'BATSMAN' | 'BOWLER' | 'ALL_ROUNDER' | 'WK';
export type RankingType = 'batting' | 'bowling' | 'all-rounder';

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

export interface IPlayer {
  id: string;
  name: string;
  country: string;
  role: PlayerRole;
  battingStyle?: string | null;
  bowlingStyle?: string | null;
  photo?: string | null;
  stats?: PlayerStats | null;
}

export interface BattingStats {
  matches: number;
  innings: number;
  runs: number;
  average: number;
  strikeRate: number;
  hundreds: number;
  fifties: number;
  fours: number;
  sixes: number;
  highScore?: number;
}

export interface BowlingStats {
  matches: number;
  innings: number;
  wickets: number;
  average: number;
  economy: number;
  strikeRate: number;
  fiveWickets: number;
  bestBowling?: string;
}

export interface PlayerStats {
  batting?: BattingStats;
  bowling?: BowlingStats;
}

export interface IMatch {
  id: string;
  homeTeam: ITeam;
  awayTeam: ITeam;
  series: Pick<ISeries, 'id' | 'name'>;
  format: MatchFormat;
  status: MatchStatus;
  venue: string;
  startTime: string; // ISO string
  result?: string | null;
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
export type Series = ISeries;
export type Player = IPlayer;
export type Match = IMatch;
export type Scorecard = IScorecard;
export type NewsArticle = INewsArticle;

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
  runRate?: number;
  // Optional per-innings lines; falls back to the top-level (current innings)
  // batting/bowling arrays when absent.
  batting?: BatsmanLine[];
  bowling?: BowlerLine[];
  extras?: number;
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

export interface IScorecard {
  innings: InningsScore[];
  currentInnings?: number;
  batting?: BatsmanLine[];
  bowling?: BowlerLine[];
  extras?: number;
  target?: number;
  requiredRunRate?: number;
  commentary?: CommentaryBall[];
}

export interface CommentaryBall {
  id: string;
  over: number;
  ball: number;
  runs: number;
  isWicket: boolean;
  isBoundary?: boolean;
  text: string;
  timestamp?: string;
}

export interface PointsTableRow {
  teamId: string;
  teamName: string;
  played: number;
  won: number;
  lost: number;
  tied: number;
  points: number;
  netRunRate: number;
}

export type RankingRole = 'BATTING' | 'BOWLING' | 'ALLROUNDER';
export type RankingGender = 'MEN' | 'WOMEN';

export interface RankingEntry {
  id: string;
  playerName: string;
  country: string;
  role: RankingRole;
  gender: RankingGender;
  points: number;
  rating: number;
  position: number;
}

export interface INewsArticle {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  thumbnail?: string | null;
  author: string;
  publishedAt: string; // ISO string
  tags: string[];
}

export interface WinProbability {
  matchId: string;
  homeTeamPct: number;
  awayTeamPct: number;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// API envelope
// ---------------------------------------------------------------------------

export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  page: number;
  pageSize: number;
  total: number;
}

// ---------------------------------------------------------------------------
// Socket.io event payloads
// ---------------------------------------------------------------------------

export interface ScoreUpdatePayload {
  matchId: string;
  scorecard: Scorecard;
  currentScore: string; // e.g. "287/4 (45.2)"
}

export interface BallDeliveredPayload {
  matchId: string;
  over: number;
  ball: number;
  runs: number;
  isWicket: boolean;
  commentary: string;
}

export interface WicketFallPayload {
  matchId: string;
  playerName: string;
  score: string; // e.g. "142/3"
  over: number;
}

export interface ServerToClientEvents {
  'score:update': (data: ScoreUpdatePayload) => void;
  'wicket:fall': (data: WicketFallPayload) => void;
  'ball:delivered': (data: BallDeliveredPayload) => void;
}

export interface ClientToServerEvents {
  'match:subscribe': (matchId: string) => void;
  'match:unsubscribe': (matchId: string) => void;
}
