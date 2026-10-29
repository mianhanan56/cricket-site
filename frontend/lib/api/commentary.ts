// The ball-by-ball feed (/match/commentary): deliveries, the events between them,
// end-of-over cards and the upstream's own notes, all interleaved in one stream of rows.
import type { BallExtra, CommentaryBall, FeedNote, MatchEvent, MatchEventKind, OverSummary, WicketRef } from '@/types';
import { apiGet, type FetchOpts } from './client';
import { plainText, toFeedNote } from './feedNotes';
import { cleanKey } from './names';

/**
 * One feed row as the Worker shapes it. Which fields a row carries depends on its `type`, and a
 * name means the same thing on every row that has it. Stat-card numbers can arrive as strings ("").
 */
export interface ApiBallFeed {
  /**
   * Row kind: "b" a delivery, "o" over summary, "w" wicket card, "ic2" innings end,
   * "tc" target, "to" toss, "pm"/"tm" player/team milestone, "ac" review called, "rc" review
   * decision, "t" a written note, "ps"/"pbc"/"pvtc" stat cards. Other kinds (polls, tweets)
   * carry only `type`, `id` and `inning`.
   */
  type?: string;
  /** Epoch ms — also the paging cursor. */
  id?: number;
  /** Innings index, 0-based. */
  inning?: number;
  /** 0-based over number on wicket, milestone, innings-end and review rows and over summaries; -1 where the upstream ties the row to none. */
  overIndex?: number;
  /** The row's prose: a delivery's description, an event's sentence, a note's markup. Often empty. */
  text?: string;

  /**
   * Delivery. The outcome in the upstream's shorthand: "0", "4", "W", "WD"/"NB", "4wd", "1lb", "0+1".
   * Read it through `parseBallOutcome` — `Number(outcome)` is NaN on all but the first form.
   */
  outcome?: string | number;
  /** Delivery: over.ball, "48.2". */
  over?: string | number;
  /** Delivery: "Bowler to Batter". */
  headline?: string;
  strikerKey?: string;
  /** Delivery and over summary. */
  bowlerKey?: string;
  /** Team score, "205/7": after a delivery, at the end of an over, at the end of an innings. */
  score?: string;

  /** Over summary: the over's own; wicket card: the batter's; milestone: the one reached; head-to-heads: the record's. */
  runs?: number;
  /** Over summary: wickets in the over. */
  wickets?: number;
  /** Over summary: the over's outcomes, "1.0.0.0.0.0". */
  outcomes?: string;
  battingTeamName?: string;
  batter1Name?: string;
  batter1Key?: string;
  /** "13(52)". */
  batter1Score?: string;
  batter2Name?: string;
  batter2Key?: string;
  batter2Score?: string;
  bowlerName?: string;
  /** "2-61(14.0)". */
  bowlerFigures?: string;

  /** The player or team the row is about: wicket card, milestones, innings end, player card. */
  name?: string;
  playerKey?: string;
  /** Wicket card, 1-based. */
  wicketNumber?: number;
  /** Faced on a wicket card or to a milestone; in the record on batter v bowler. */
  balls?: number | string;
  fours?: number;
  sixes?: number;
  strikeRate?: number | string;
  /** Wicket card: "c Dhir b Krishna". */
  howOut?: string;
  /** Innings end: "19.4". */
  overs?: string;
  /** Target: "7.30". */
  requiredRunRate?: string;
  /** Note: "f" a featured note. */
  subType?: string | number;

  /** Review rows: reviews each side has left, by team key. */
  reviewsLeft?: Record<string, number>;
  /** Review decision: 0 the batting side's review, 1 the fielding side's. */
  reviewedBy?: number;
  /** Review decision: "1" out. */
  result?: string | number;
  /** Review decision: "1" an edge, "0" none, -1 not used. */
  ultraEdge?: string | number;
  battingTeamKey?: string;
  bowlingTeamKey?: string;

  /** Player card: "1" a batter's, "0" a bowler's. */
  discipline?: string;
  /** Player card: -1 unranked. */
  rank?: number | string;
  age?: number | string;
  battingPosition?: number | string;
  /** Player card (career) and head-to-heads. */
  innings?: number | string;
  /** Player card: career runs for a batter, wickets for a bowler. */
  total?: number | string;
  average?: number | string;
  /** Player card: strike rate for a batter, economy for a bowler. */
  rate?: number | string;

  batterKey?: string;
  /** Head-to-heads: "ODI". */
  format?: string;
  /** Batter v bowler: the year the record starts. */
  since?: number | string;
  dismissals?: number | string;
  /** Player v team: the opposing team. */
  opponentKey?: string;
}

// Three overs, which the header's recent-balls strip is sized to. This walk runs
// on every live tick, so it stays small; the commentary tab passes `minBalls`.
const MIN_BALLS = 18;

/** Stop regardless, so a feed that keeps handing back events can't spin. */
const MAX_COMMENTARY_PAGES = 5;

/** A real delivery. Partnership and milestone rows can also be `type: "w"`; they are not wickets. */
function isDelivery(f: ApiBallFeed): boolean {
  return f.type === 'b' && String(f.over ?? '').includes('.');
}

/** What a delivery cost, decoded from the upstream's `outcome` shorthand. */
export interface BallOutcome {
  /** Bat runs + extras, penalty included — what the total went up by. */
  runs: number;
  batRuns: number;
  extraRuns: number;
  extra: BallExtra | null;
  isWicket: boolean;
}

const EXTRA_CODES: Record<string, BallExtra> = {
  wd: 'wide',
  nb: 'noball',
  lb: 'legbye',
  b: 'bye',
};

/** Wides and no balls cost a run before anything is run or hit. */
const PENALTY: Partial<Record<BallExtra, number>> = { wide: 1, noball: 1 };

/**
 * Decode one `outcome` value, every form checked against the running total: "4" off the
 * bat; "W" (runs can ride along: "W+1", "1W"); "WD"/"NB" the penalty alone; "4wd"
 * five to the total; "1lb"/"4b" legal byes; "0+1" bat runs plus extras. Anything
 * unrecognised is a dot, so one odd token costs one ball, not the strip.
 */
export function parseBallOutcome(raw: unknown): BallOutcome {
  const none: BallOutcome = {
    runs: 0,
    batRuns: 0,
    extraRuns: 0,
    extra: null,
    isWicket: false,
  };

  const token = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
  if (!token) return none;

  // Peel the wicket marker off first so the rest parses as a plain outcome. It only
  // comes off when what is left is itself an outcome: "wd" is a wide, not a wicket.
  let body = token;
  let isWicket = false;
  const REST = String.raw`\d*(?:wd|nb|lb|b)?`;
  const wicket =
    body.match(new RegExp(`^w\\+?(${REST})$`)) ?? body.match(new RegExp(`^(${REST})\\+?w$`));
  if (wicket) {
    isWicket = true;
    body = wicket[1];
  }
  if (!body) return { ...none, isWicket };

  // "<n>wd" / "<n>nb" / "<n>lb" / "<n>b": the count is what was run or hit, on top of any penalty.
  const extra = body.match(/^(\d*)(wd|nb|lb|b)$/);
  if (extra) {
    const kind = EXTRA_CODES[extra[2]];
    const penalty = PENALTY[kind] ?? 0;
    // A bare "1lb" is one leg bye; a bare "NB" is a no ball nobody scored off.
    const scored = extra[1] === '' ? (penalty ? 0 : 1) : Number(extra[1]);
    // Runs off a no ball are the batter's; off a wide they never are.
    const batRuns = kind === 'noball' ? scored : 0;
    const extraRuns = penalty + (kind === 'noball' ? 0 : scored);
    return { runs: batRuns + extraRuns, batRuns, extraRuns, extra: kind, isWicket };
  }

  const split = body.match(/^(\d+)\+(\d+)$/);
  if (split) {
    const batRuns = Number(split[1]);
    const extraRuns = Number(split[2]);
    return { runs: batRuns + extraRuns, batRuns, extraRuns, extra: null, isWicket };
  }

  const plain = body.match(/^\d+$/);
  if (plain) {
    const batRuns = Number(body);
    return { runs: batRuns, batRuns, extraRuns: 0, extra: null, isWicket };
  }

  return { ...none, isWicket };
}

// Rows the upstream's app renders as cards (career stats, head-to-heads, polls) are not
// match events and have no entry here; over summaries are read whole by `toOverSummary`.
const EVENT_LABELS: Partial<Record<string, { label: string; kind: MatchEventKind }>> = {
  w: { label: 'Wicket', kind: 'WICKET' },
  ic2: { label: 'Innings end', kind: 'INNINGS_END' },
  tc: { label: 'Target set', kind: 'TARGET' },
  to: { label: 'Toss', kind: 'TOSS' },
  // One label for both: the sentence already says whose milestone it is.
  pm: { label: 'Milestone', kind: 'MILESTONE' },
  tm: { label: 'Milestone', kind: 'MILESTONE' },
  rc: { label: 'Umpire review', kind: 'REVIEW' },
  ac: { label: 'Umpire review', kind: 'REVIEW' },
  t: { label: 'Update', kind: 'NOTE' },
};

/** One non-delivery row as an event, in the upstream's own words and numbers. Null for deliveries and cards. */
function toMatchEvent(f: ApiBallFeed): MatchEvent | null {
  if (isDelivery(f)) return null;

  const spec = EVENT_LABELS[f.type ?? ''];
  if (!spec) return null;

  const over = f.overIndex !== undefined && f.overIndex >= 0 ? f.overIndex + 1 : null;
  let text = plainText(f.text);
  let wicket: WicketRef | undefined;

  if (spec.kind === 'WICKET' && f.name) {
    // One short line per wicket; the team score is added from the scorecard by `keyMoments`.
    const who = f.name;
    const faced = typeof f.balls === 'number' ? ` (${f.balls})` : '';
    text = `${who} out${f.runs !== undefined ? ` for ${f.runs}${faced}` : ''}`;
    wicket = {
      playerId: cleanKey(f.playerKey) || null,
      name: who,
      inning: f.inning ?? null,
      number: f.wicketNumber ?? null,
    };
  } else if (spec.kind === 'MILESTONE' && f.name) {
    text = `${f.name} — ${text}`;
  }

  if (!text) return null;

  return {
    id: String(f.id ?? `${f.type}-${f.overIndex ?? ''}`),
    kind: spec.kind,
    label: spec.label,
    text,
    over,
    timestamp: f.id ? new Date(f.id).toISOString() : undefined,
    ...(wicket ? { wicket } : {}),
  };
}

/** Deliveries, over summaries and events from one walk of the feed, newest first. */
export interface ApiMatchFeed {
  balls: CommentaryBall[];
  events: MatchEvent[];
  /** End-of-over cards, newest first. */
  overs: OverSummary[];
  /** Writers' notes, stat cards, reviews and milestones between the balls. */
  notes: FeedNote[];
  /** The oldest feed id reached — pass it back as `before` to continue. Null when nothing was found. */
  oldest: string | null;
  /** No unseen rows came back, so there is nothing older to offer. */
  exhausted: boolean;
  /** The newest feed id read — pass it back as `since` on the next poll. Null when nothing was found. */
  newest: number | null;
}

export interface FeedWalkOpts extends FetchOpts {
  /** Stop once this many deliveries are held. */
  minBalls?: number;
  /** Hard page cap for one walk. */
  maxPages?: number;
  /** Continue from an earlier walk's `oldest` instead of the live tail. */
  before?: string;
  /** An earlier walk's `newest`: once a page reaches it, the caller already holds the rest. */
  since?: number | null;
}

/** The upstream writes runs off a wide or no ball first ("1nb"); the ball strip writes them after ("nb+1"). */
const overToken = (t: string): string => t.replace(/^(\d+)(nb|wd)$/i, (_, runs: string, extra: string) => `${extra.toLowerCase()}+${runs}`);

/** An over-summary row as a whole card: the balls, the score, who was in and who bowled. */
function toOverSummary(f: ApiBallFeed): OverSummary | null {
  if (f.type !== 'o' || f.overIndex === undefined || f.overIndex < 0) return null;

  const batsmen = [
    { playerId: cleanKey(f.batter1Key) || null, name: f.batter1Name ?? '', figures: f.batter1Score ?? null },
    { playerId: cleanKey(f.batter2Key) || null, name: f.batter2Name ?? '', figures: f.batter2Score ?? null },
  ].filter((b) => b.name);

  return {
    id: String(f.id ?? `o-${f.overIndex}`),
    over: f.overIndex + 1,
    inning: f.inning ?? 0,
    runs: f.runs ?? 0,
    wickets: f.wickets ?? 0,
    balls: (f.outcomes ?? '').split('.').filter((b) => b !== '').map(overToken),
    score: f.score ?? null,
    battingTeam: f.battingTeamName ?? null,
    batsmen,
    bowler: f.bowlerName
      ? { playerId: cleanKey(f.bowlerKey) || null, name: f.bowlerName, figures: f.bowlerFigures ?? null }
      : null,
  };
}

/** Every delivery of one innings in one request. */
export async function getApiInningsBalls(matchKey: string, inning: number): Promise<CommentaryBall[]> {
  return (await getApiInningsFeed(matchKey, inning)).balls;
}

/**
 * One innings decoded whole. A cursor that is not a feed id makes the upstream send the whole
 * feed oldest first; `inning` narrows it (a Worker without the param ignores it).
 */
export async function getApiInningsFeed(
  matchKey: string,
  inning: number
): Promise<Pick<ApiMatchFeed, 'balls' | 'events' | 'overs' | 'notes'>> {
  const qs = new URLSearchParams({ matchKey, lastDocId: '1' });
  if (inning >= 0 && inning <= 3) qs.set('inning', String(inning));
  const rows = (await apiGet<ApiBallFeed[]>(`/match/commentary?${qs}`, { revalidate: 5 })) ?? [];
  return feedFromRows(rows);
}

/**
 * Walk the feed back from the live tail (~10 rows a page) until it holds `minBalls`
 * deliveries. Balls and events come from the same rows, so one walk serves both.
 */
export async function getApiMatchFeed(
  matchKey: string,
  opts: FeedWalkOpts = {}
): Promise<ApiMatchFeed> {
  const { minBalls = MIN_BALLS, maxPages = MAX_COMMENTARY_PAGES, before, since } = opts;

  const feed: ApiBallFeed[] = [];
  const seen = new Set<number>();
  let cursor = before ?? '';
  let exhausted = false;
  let oldest: number | null = null;
  let newest: number | null = null;
  let balls = 0;

  for (let page = 0; page < maxPages; page++) {
    const qs = new URLSearchParams({ matchKey });
    if (cursor) qs.set('lastDocId', cursor);

    const batch = await apiGet<ApiBallFeed[]>(`/match/commentary?${qs}`, {
      revalidate: 5,
      ...opts,
    });
    if (!batch?.length) {
      exhausted = true;
      break;
    }

    // `id` is the cursor as well as the identity, so a page of seen ids is the end.
    const fresh = batch.filter((f) => f.id !== undefined && !seen.has(f.id));
    if (!fresh.length) {
      exhausted = true;
      break;
    }

    for (const f of fresh) {
      const id = f.id as number;
      seen.add(id);
      feed.push(f);
      if (oldest === null || id < oldest) oldest = id;
      if (newest === null || id > newest) newest = id;
      if (isDelivery(f)) balls += 1;
    }

    if (balls >= minBalls || (since && oldest !== null && oldest <= since)) break;

    cursor = String(batch[batch.length - 1].id ?? '');
    if (!cursor) {
      exhausted = true;
      break;
    }
  }

  return { ...feedFromRows(feed), oldest: oldest === null ? null : String(oldest), exhausted, newest };
}

export type ApiFeedRow = ApiBallFeed;

/** Deliveries, events, over cards and notes from rows already in hand — a walk's, or the live socket's page. */
export function feedFromRows(feed: ApiBallFeed[]): Pick<ApiMatchFeed, 'balls' | 'events' | 'overs' | 'notes'> {
  const balls = feed
    .filter(isDelivery)
    .map((f) => {
      const [over, ball] = String(f.over ?? '').split('.');
      const outcome = parseBallOutcome(f.outcome);
      const text = [plainText(f.headline), plainText(f.text)].filter(Boolean).join(' — ');

      return {
        id: String(f.id ?? `${over}.${ball}`),
        // The upstream numbers an illegal delivery with the ball it is re-bowled as, so no adjusting.
        over: Number(over) || 0,
        ball: Number(ball) || 0,
        runs: outcome.runs,
        batRuns: outcome.batRuns,
        extraRuns: outcome.extraRuns,
        extra: outcome.extra,
        isWicket: outcome.isWicket,
        text,
        scoreAfter: f.score ?? null,
        inning: f.inning,
        timestamp: f.id ? new Date(f.id).toISOString() : undefined,
        batterId: f.strikerKey || undefined,
        bowlerId: f.bowlerKey || undefined,
      } satisfies CommentaryBall;
    })
    .filter((b) => Boolean(b.text));

  const events = feed
    .map(toMatchEvent)
    .filter((e): e is MatchEvent => e !== null);

  const overs = feed
    .map(toOverSummary)
    .filter((o): o is OverSummary => o !== null);

  const notes = feed.map(toFeedNote).filter((n): n is FeedNote => n !== null);

  return { balls, events, overs, notes };
}
