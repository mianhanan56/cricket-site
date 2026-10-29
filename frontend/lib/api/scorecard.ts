// Scorecards (the upstream's getSC4): one object per innings, each a bundle of dot-packed
// strings. Layouts are from the upstream's own scorecard bundle and add up: bowler runs
// plus byes and leg byes equal the total, and bowler wickets plus run-outs the
// wicket count.
//
//   batting  key.runs.balls.4s.6s.teamBalls.teamRuns.dismissal.bowler.fielder/wagon-wheel/
//            (team balls come before team runs; read the other way a 66-run stand reads 102)
//            A batter in stops after the sixes; a bare key is yet to bat (the XI before play).
//   bowling  key.runs.balls.maidens.wickets
import type {
  BatsmanLine,
  BowlerLine,
  ExtrasBreakdown,
  FallOfWicket,
  InningsPhase,
  InningsScore,
  MatchStatus,
  Partnership,
  RetirementKind,
} from '@/types';
import { DEFAULT_BALLS_PER_OVER, oversFrom } from '../overs';
import { apiGet, type FetchOpts } from './client';
import { cleanKey, resolveKeys, shortName, type NameCache } from './names';

interface ApiScorecardInnings {
  /** The batting side. */
  teamKey?: string;
  /** "185/10(202" — runs/wickets(balls). */
  total?: string;
  /** "byes.legByes.wides.noBalls.penalty". */
  extras?: string;
  /** One line per player in the XI. */
  batting?: string[];
  /** One line per bowler used. */
  bowling?: string[];
  /**
   * In order: "15K.19.31.AK.18.33.37.64" is batter A key/runs/balls, batter B
   * key/runs/balls, then the stand's runs and balls — which include extras, so they
   * are not the sum of the two batters'.
   */
  partnerships?: string[];
}

/** "byes.legByes.wides.noBalls.penalty" → the five lines and their sum; blanks read as 0. */
function decodeExtras(raw: string | undefined): { total: number; breakdown: ExtrasBreakdown } {
  const [byes, legByes, wides, noBalls, penalty] = (raw ?? '')
    .split('.')
    .map((n) => Number(n) || 0);
  const breakdown: ExtrasBreakdown = {
    byes: byes ?? 0,
    legByes: legByes ?? 0,
    wides: wides ?? 0,
    noBalls: noBalls ?? 0,
    penalty: penalty ?? 0,
  };

  return {
    total: Object.values(breakdown).reduce((sum, n) => sum + n, 0),
    breakdown,
  };
}

/** The dot-separated fields of a line, wagon-wheel data dropped. */
const lineHead = (line: string): string[] => line.split('/')[0].split('.');

const TEAM_BALLS_INDEX = 5;
const TEAM_RUNS_INDEX = 6;
/** Present only once the batter's innings has ended. */
const DISMISSAL_TYPE_INDEX = 7;
const BOWLER_INDEX = 8;
const FIELDER_INDEX = 9;

/** Retired hurt and absent hurt end an innings without a wicket. */
const RETIRED_CODES = new Set(['11', '13']);

const RETIREMENT_KINDS: Record<string, RetirementKind> = {
  '11': 'HURT',
  '12': 'OUT',
  '13': 'ABSENT',
};

/** "c Pandya b Bumrah". Every branch degrades to the bare verb when a name is missing. */
function describeDismissal(head: string[], names: NameCache): string {
  const bowler = shortName(head[BOWLER_INDEX], names);
  const fielder = shortName(head[FIELDER_INDEX], names);

  switch (head[DISMISSAL_TYPE_INDEX]) {
    case '1':
      return bowler ? `b ${bowler}` : 'bowled';
    case '2':
      if (fielder && bowler) return `c ${fielder} b ${bowler}`;
      return bowler ? `b ${bowler}` : 'caught';
    case '3':
      return bowler ? `c & b ${bowler}` : 'caught & bowled';
    case '4':
      if (bowler && fielder) return `run out (${bowler} / ${fielder})`;
      return bowler ? `run out (${bowler})` : 'run out';
    case '5':
      return bowler ? `lbw b ${bowler}` : 'lbw';
    case '6':
      return bowler ? `hit wicket b ${bowler}` : 'hit wicket';
    case '8':
      if (fielder && bowler) return `st ${fielder} b ${bowler}`;
      return bowler ? `st b ${bowler}` : 'stumped';
    case '9':
      return bowler ? `mankaded (${bowler})` : 'mankaded';
    case '10':
      return 'obstructing the field';
    case '11':
      return 'retired hurt';
    case '12':
      return 'retired out';
    case '13':
      return 'absent hurt';
    case '14':
      return 'timed out';
    default:
      return 'out';
  }
}

function decodeBatsman(line: string, names: NameCache): BatsmanLine | null {
  const head = lineHead(line);
  const [key, runs, balls, fours, sixes] = head;

  // A bare key is a player yet to bat — that is `yetToBat`, not a card row.
  if (!key || head.length < 2) return null;

  const r = Number(runs) || 0;
  const b = Number(balls) || 0;
  const dismissed = head.length > DISMISSAL_TYPE_INDEX;

  return {
    playerId: key,
    name: names.p.get(key)?.name ?? key,
    runs: r,
    balls: b,
    fours: Number(fours) || 0,
    sixes: Number(sixes) || 0,
    strikeRate: b ? Math.round((r / b) * 10000) / 100 : 0,
    // A retirement ends the innings but is not a wicket.
    out: dismissed && !RETIRED_CODES.has(head[DISMISSAL_TYPE_INDEX]),
    dismissal: dismissed ? describeDismissal(head, names) : 'not out',
    ...(dismissed && RETIREMENT_KINDS[head[DISMISSAL_TYPE_INDEX]]
      ? { retired: RETIREMENT_KINDS[head[DISMISSAL_TYPE_INDEX]] }
      : null),
  };
}

/** The innings' stands, in order. `unbroken` is decided by the caller. */
function decodePartnerships(
  raw: string[] | undefined,
  names: NameCache
): Partnership[] {
  return (raw ?? [])
    .map((line) => {
      const [aKey, aRuns, aBalls, bKey, bRuns, bBalls, runs, balls] = line.split('.');
      if (!aKey || !bKey) return null;

      return {
        a: {
          playerId: aKey,
          name: names.p.get(aKey)?.name ?? aKey,
          runs: Number(aRuns) || 0,
          balls: Number(aBalls) || 0,
        },
        b: {
          playerId: bKey,
          name: names.p.get(bKey)?.name ?? bKey,
          runs: Number(bRuns) || 0,
          balls: Number(bBalls) || 0,
        },
        runs: Number(runs) || 0,
        balls: Number(balls) || 0,
      } satisfies Partnership;
    })
    .filter((x): x is Partnership => x !== null);
}

/**
 * The fall of wickets, from the team score stamped on each departing batter's line,
 * sorted into the order the wickets fell. Retirements are skipped: no wicket fell.
 */
function decodeFallOfWickets(
  lines: string[],
  names: NameCache,
  perOver: number
): FallOfWicket[] {
  return lines
    .map(lineHead)
    .filter(
      (head) =>
        head.length > DISMISSAL_TYPE_INDEX && !RETIRED_CODES.has(head[DISMISSAL_TYPE_INDEX])
    )
    .map((head) => ({
      runs: Number(head[TEAM_RUNS_INDEX]) || 0,
      balls: Number(head[TEAM_BALLS_INDEX]) || 0,
      playerId: head[0],
      name: names.p.get(head[0])?.name ?? head[0],
      playerRuns: Number(head[1]) || 0,
      playerBalls: Number(head[2]) || 0,
    }))
    .sort((x, y) => x.balls - y.balls || x.runs - y.runs)
    .map((w, i) => ({
      wicket: i + 1,
      runs: w.runs,
      overs: oversFrom(w.balls, perOver),
      playerId: w.playerId,
      name: w.name,
      playerRuns: w.playerRuns,
      playerBalls: w.playerBalls,
    }));
}

function decodeBowler(
  line: string,
  names: NameCache,
  perOver: number
): BowlerLine | null {
  const [key, runs, balls, maidens, wickets] = lineHead(line);
  if (!key || balls === undefined) return null;

  const r = Number(runs) || 0;
  const b = Number(balls) || 0;

  return {
    playerId: key,
    name: names.p.get(key)?.name ?? key,
    overs: oversFrom(b, perOver),
    maidens: Number(maidens) || 0,
    runs: r,
    wickets: Number(wickets) || 0,
    economy: b ? Math.round((r / (b / perOver)) * 100) / 100 : 0,
  };
}

/**
 * Every innings of a match, in order. `status` only decides whether the latest
 * innings is CURRENT — a card alone can't tell a live innings from a finished one.
 */
export async function getApiScorecard(
  matchKey: string,
  opts: FetchOpts & { ballsPerOver?: number; status?: MatchStatus } = {}
): Promise<InningsScore[]> {
  const raw = await apiGet<ApiScorecardBody>(`/match/scorecard?key=${encodeURIComponent(matchKey)}`, {
    revalidate: 5,
    ...opts,
  });
  return scorecardFromRaw(raw, opts);
}

export type ApiScorecardBody = ApiScorecardInnings[] | Record<string, ApiScorecardInnings>;

/** A scorecard body already in hand, decoded the same way a fetched one is. */
export async function scorecardFromRaw(
  raw: ApiScorecardBody,
  opts: FetchOpts & { ballsPerOver?: number; status?: MatchStatus } = {}
): Promise<InningsScore[]> {
  const perOver = opts.ballsPerOver || DEFAULT_BALLS_PER_OVER;
  const innings = Array.isArray(raw) ? raw : Object.values(raw ?? {});
  if (!innings.length) return [];

  // Batters, bowlers and every fielder credited in a dismissal — a miss prints "c 6QP b BGT".
  const playerKeys = innings.flatMap((i) => [
    ...(i.batting ?? []).flatMap((line) => {
      const head = lineHead(line);
      return [head[0], head[BOWLER_INDEX], head[FIELDER_INDEX]];
    }),
    ...(i.bowling ?? []).map((line) => line.split('.')[0]),
  ]);
  const teamKeys = innings.map((i) => cleanKey(i.teamKey)).filter(Boolean);

  const names = await resolveKeys({ p: playerKeys.filter(Boolean), t: teamKeys }, opts);

  // The card lists innings in slot order, so a side's second entry is its second innings.
  const seenPerTeam = new Map<string, number>();
  const cards = innings.flatMap((inn) => {
    const total = /^(\d+)\/(\d+)\((\d+)/.exec(inn.total ?? '');
    const teamKey = cleanKey(inn.teamKey);
    const balls = total ? Number(total[3]) : 0;
    const lines = inn.batting ?? [];

    // No total and no XI is a slot the upstream is holding; emitting it would print a phantom "0/0".
    if (!total && !lines.length) return [];

    const inningsNumber = (seenPerTeam.get(teamKey) ?? 0) + 1;
    seenPerTeam.set(teamKey, inningsNumber);

    const extras = decodeExtras(inn.extras);

    return {
      teamId: teamKey,
      inningsNumber,
      teamShortName: names.t.get(teamKey)?.shortName ?? teamKey,
      runs: total ? Number(total[1]) : 0,
      wickets: total ? Number(total[2]) : 0,
      overs: oversFrom(balls, perOver),
      // An XI with no total: the side is listed but the innings has not begun.
      notStarted: !total,
      extras: extras.total,
      extrasBreakdown: extras.breakdown,
      batting: lines
        .map((line) => decodeBatsman(line, names))
        .filter((x): x is BatsmanLine => x !== null),
      yetToBat: lines
        .filter((line) => !line.split('/')[0].includes('.'))
        .map((line) => {
          const key = line.split('/')[0];
          return { playerId: key, name: names.p.get(key)?.name ?? key };
        }),
      bowling: (inn.bowling ?? [])
        .map((line) => decodeBowler(line, names, perOver))
        .filter((x): x is BowlerLine => x !== null),
      partnerships: decodePartnerships(inn.partnerships, names),
      fallOfWickets: decodeFallOfWickets(lines, names, perOver),
    };
  });

  // "Current" is a statement about the whole card: the last innings batted, while live.
  const lastBatted = cards.reduce((last, inn, i) => (inn.notStarted ? last : i), -1);

  return cards.map((inn, i) => {
    // The stand at the crease is the last one listed, while wickets remain. The upstream adds the new
    // pair's stand a ball after a wicket, so a listed stand whose batter is out is already broken.
    const gone = new Set(inn.batting.filter((b) => b.dismissal !== 'not out').map((b) => b.playerId));
    return {
      ...inn,
      partnerships: inn.partnerships.map((p, j) =>
        j === inn.partnerships.length - 1 &&
        inn.wickets < 10 &&
        !inn.notStarted &&
        !gone.has(p.a.playerId) &&
        !gone.has(p.b.playerId)
          ? { ...p, unbroken: true }
          : p
      ),
      phase: (inn.notStarted
        ? 'UPCOMING'
        : i === lastBatted && opts.status === 'LIVE'
          ? 'CURRENT'
          : 'COMPLETED') satisfies InningsPhase as InningsPhase,
    };
  });
}
