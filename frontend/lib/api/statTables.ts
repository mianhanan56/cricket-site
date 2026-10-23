// Full series rankings ("Most runs"), aggregated from every played match's
// scorecard: the upstream's own leaderboard is a GraphQL call keyed by ids nothing
// public resolves. One card per match, so this stays on the stat pages, behind a
// long revalidate and bounded concurrency. Figures can differ from the leaders
// board (the upstream's) by a match awarded without a completed card.
import type { InningsScore, SeriesBattingTotals, SeriesBowlingTotals, SeriesStatKind, SeriesStatRow, SeriesStatTable, Team } from '@/types';
import { DEFAULT_BALLS_PER_OVER, ballsFrom, oversFrom } from '../overs';
import { inWidth, type FetchOpts } from './client';
import { cleanKey, playerImageUrl } from './names';
import { getApiScorecard } from './scorecard';
import { getApiSeriesSchedule, type SeriesScheduleMatch } from './series';

/** Matches whose cards are read for one table. Two full seasons of a league. */
const STAT_MATCH_CAP = 80;

const STAT_FETCH_WIDTH = 8;

/** For finished cards, which never change. A live card is read at the scorecard's own pace. */
const STAT_REVALIDATE = 900;

interface StatAccumulator {
  playerKey: string;
  name: string;
  teamKey: string;
  team: Team;
  /** Matches the player appeared in, either discipline. */
  matches: Set<string>;
  bat: {
    innings: number;
    runs: number;
    balls: number;
    fours: number;
    sixes: number;
    notOuts: number;
    fifties: number;
    hundreds: number;
    best: number;
    bestNotOut: boolean;
  };
  bowl: {
    innings: number;
    balls: number;
    runs: number;
    wickets: number;
    bestWickets: number;
    bestRuns: number;
    fiveFors: number;
  };
}

function emptyAccumulator(playerKey: string, name: string, team: Team): StatAccumulator {
  return {
    playerKey,
    name,
    teamKey: team.id,
    team,
    matches: new Set(),
    bat: {
      innings: 0,
      runs: 0,
      balls: 0,
      fours: 0,
      sixes: 0,
      notOuts: 0,
      fifties: 0,
      hundreds: 0,
      best: -1,
      bestNotOut: false,
    },
    bowl: { innings: 0, balls: 0, runs: 0, wickets: 0, bestWickets: -1, bestRuns: 0, fiveFors: 0 },
  };
}

const ratio = (top: number, bottom: number): number | null =>
  bottom > 0 ? Math.round((top / bottom) * 100) / 100 : null;

/** How each table is labelled, sorted, and what figure it prints. */
const STAT_SPECS: Record<
  SeriesStatKind,
  {
    label: string;
    discipline: 'BATTING' | 'BOWLING';
    /** Rows that do not clear this are not in the table at all. */
    qualifies: (row: SeriesStatRow) => boolean;
    /** The printed figure. */
    value: (row: SeriesStatRow) => string;
    /** Descending sort keys, most significant first. Ties fall to the next. */
    keys: (row: SeriesStatRow) => number[];
    qualifier: string | null;
  }
> = {
  RUNS: {
    label: 'Most runs',
    discipline: 'BATTING',
    qualifies: (r) => r.batting.innings > 0,
    value: (r) => String(r.batting.runs),
    keys: (r) => [r.batting.runs, r.batting.strikeRate ?? 0],
    qualifier: null,
  },
  WICKETS: {
    label: 'Most wickets',
    discipline: 'BOWLING',
    qualifies: (r) => r.bowling.innings > 0,
    value: (r) => String(r.bowling.wickets),
    keys: (r) => [r.bowling.wickets, -(r.bowling.economy ?? 99)],
    qualifier: null,
  },
  HIGHEST_SCORE: {
    label: 'Highest score',
    discipline: 'BATTING',
    qualifies: (r) => r.batting.innings > 0,
    value: (r) => r.batting.highest,
    // The `*` is stripped for sorting; an unbeaten score of the same size ranks
    // above a dismissed one, which is how a scorecard reads it.
    keys: (r) => [Number.parseInt(r.batting.highest, 10) || 0, r.batting.highest.includes('*') ? 1 : 0],
    qualifier: null,
  },
  BEST_FIGURES: {
    label: 'Best figures',
    discipline: 'BOWLING',
    qualifies: (r) => r.bowling.wickets > 0,
    value: (r) => r.bowling.best,
    keys: (r) => {
      const [w, runs] = r.bowling.best.split('/');
      return [Number.parseInt(w, 10) || 0, -(Number.parseInt(runs, 10) || 0)];
    },
    qualifier: null,
  },
  SIXES: {
    label: 'Most sixes',
    discipline: 'BATTING',
    qualifies: (r) => r.batting.sixes > 0,
    value: (r) => String(r.batting.sixes),
    keys: (r) => [r.batting.sixes, r.batting.runs],
    qualifier: null,
  },
  FOURS: {
    label: 'Most fours',
    discipline: 'BATTING',
    qualifies: (r) => r.batting.fours > 0,
    value: (r) => String(r.batting.fours),
    keys: (r) => [r.batting.fours, r.batting.runs],
    qualifier: null,
  },
  FIFTIES: {
    label: 'Most fifties',
    discipline: 'BATTING',
    qualifies: (r) => r.batting.fifties > 0,
    value: (r) => String(r.batting.fifties),
    keys: (r) => [r.batting.fifties, r.batting.runs],
    qualifier: null,
  },
  HUNDREDS: {
    label: 'Most hundreds',
    discipline: 'BATTING',
    qualifies: (r) => r.batting.hundreds > 0,
    value: (r) => String(r.batting.hundreds),
    keys: (r) => [r.batting.hundreds, r.batting.runs],
    qualifier: null,
  },
  // The two rate tables need a cut, or they are won by a tail-ender who hit one
  // ball for six and a bowler who was taken off after an over.
  STRIKE_RATE: {
    label: 'Best strike rate',
    discipline: 'BATTING',
    qualifies: (r) => r.batting.balls >= 30 && r.batting.strikeRate !== null,
    value: (r) => (r.batting.strikeRate ?? 0).toFixed(2),
    keys: (r) => [r.batting.strikeRate ?? 0, r.batting.runs],
    qualifier: '30 balls faced',
  },
  ECONOMY: {
    label: 'Best economy',
    discipline: 'BOWLING',
    qualifies: (r) => r.bowling.overs >= 10 && r.bowling.economy !== null,
    value: (r) => (r.bowling.economy ?? 0).toFixed(2),
    // Ascending, so the key is negated — the whole sort is one direction.
    keys: (r) => [-(r.bowling.economy ?? 99), r.bowling.wickets],
    qualifier: '10 overs bowled',
  },
};

export function seriesStatLabel(kind: SeriesStatKind): string {
  return STAT_SPECS[kind].label;
}

export const SERIES_STAT_KINDS = Object.keys(STAT_SPECS) as SeriesStatKind[];

/** Every player's series totals, read once off the cards. Null before the first card. */
async function seriesStatRows(
  seriesKey: string,
  opts: FetchOpts = {}
): Promise<{ rows: SeriesStatRow[]; matchesCounted: number } | null> {
  const schedule = await getApiSeriesSchedule(seriesKey, {
    revalidate: STAT_REVALIDATE,
    ...opts,
  }).catch(() => null);
  if (!schedule) return null;

  // Only matches that have produced a card. A live match counts: its innings so
  // far are real runs, and the upstream's own tables include them.
  const played = schedule.matches
    .filter((m) => m.matchKey && m.status !== 'UPCOMING')
    .slice(-STAT_MATCH_CAP);
  if (!played.length) return null;

  const cards = await inWidth(played, STAT_FETCH_WIDTH, async (match) => ({
    match,
    innings: await getApiScorecard(match.matchKey as string, {
      revalidate: match.status === 'LIVE' ? 15 : STAT_REVALIDATE,
      signal: opts.signal,
    }).catch(() => [] as InningsScore[]),
  }));

  const players = new Map<string, StatAccumulator>();
  let matchesCounted = 0;

  const sideOf = (match: SeriesScheduleMatch, teamId: string | undefined): Team =>
    teamId && match.awayTeam.id === cleanKey(teamId) ? match.awayTeam : match.homeTeam;
  const opposite = (match: SeriesScheduleMatch, teamId: string | undefined): Team =>
    sideOf(match, teamId).id === match.homeTeam.id ? match.awayTeam : match.homeTeam;

  for (const { match, innings } of cards) {
    if (!innings.length) continue;
    matchesCounted += 1;

    for (const inn of innings) {
      const batted = sideOf(match, inn.teamId);
      const bowled = opposite(match, inn.teamId);

      for (const line of inn.batting ?? []) {
        if (!line.playerId) continue;
        const key = cleanKey(line.playerId);
        const acc = players.get(key) ?? emptyAccumulator(key, line.name, batted);
        players.set(key, acc);

        acc.matches.add(match.key);
        acc.bat.innings += 1;
        acc.bat.runs += line.runs;
        acc.bat.balls += line.balls;
        acc.bat.fours += line.fours;
        acc.bat.sixes += line.sixes;
        // Retired hurt is not an innings ended by the bowler, but it is not a
        // not-out for averaging either: the upstream counts it as one, so this does too.
        if (!line.out) acc.bat.notOuts += 1;
        if (line.runs >= 100) acc.bat.hundreds += 1;
        else if (line.runs >= 50) acc.bat.fifties += 1;

        if (line.runs > acc.bat.best) {
          acc.bat.best = line.runs;
          acc.bat.bestNotOut = !line.out;
        } else if (line.runs === acc.bat.best && !line.out) {
          acc.bat.bestNotOut = true;
        }
      }

      for (const line of inn.bowling ?? []) {
        if (!line.playerId) continue;
        const key = cleanKey(line.playerId);
        const acc = players.get(key) ?? emptyAccumulator(key, line.name, bowled);
        players.set(key, acc);

        acc.matches.add(match.key);
        acc.bowl.innings += 1;
        // `overs` is the upstream's printed figure — 4.3 is four overs and three balls,
        // not four and a half — so it is converted before it is summed.
        acc.bowl.balls += ballsFrom(line.overs, DEFAULT_BALLS_PER_OVER);
        acc.bowl.runs += line.runs;
        acc.bowl.wickets += line.wickets;
        if (line.wickets >= 5) acc.bowl.fiveFors += 1;

        if (
          line.wickets > acc.bowl.bestWickets ||
          (line.wickets === acc.bowl.bestWickets && line.runs < acc.bowl.bestRuns)
        ) {
          acc.bowl.bestWickets = line.wickets;
          acc.bowl.bestRuns = line.runs;
        }
      }
    }
  }

  if (!players.size) return null;

  const rows: SeriesStatRow[] = [...players.values()].map((acc) => {
    const dismissals = acc.bat.innings - acc.bat.notOuts;

    const batting: SeriesBattingTotals = {
      matches: acc.matches.size,
      innings: acc.bat.innings,
      runs: acc.bat.runs,
      balls: acc.bat.balls,
      highest: acc.bat.best < 0 ? '—' : `${acc.bat.best}${acc.bat.bestNotOut ? '*' : ''}`,
      notOuts: acc.bat.notOuts,
      average: ratio(acc.bat.runs, dismissals),
      strikeRate: acc.bat.balls > 0 ? Math.round((acc.bat.runs / acc.bat.balls) * 10000) / 100 : null,
      fours: acc.bat.fours,
      sixes: acc.bat.sixes,
      fifties: acc.bat.fifties,
      hundreds: acc.bat.hundreds,
    };

    const bowling: SeriesBowlingTotals = {
      matches: acc.matches.size,
      innings: acc.bowl.innings,
      overs: oversFrom(acc.bowl.balls, DEFAULT_BALLS_PER_OVER),
      runs: acc.bowl.runs,
      wickets: acc.bowl.wickets,
      best: acc.bowl.bestWickets < 0 ? '—' : `${acc.bowl.bestWickets}/${acc.bowl.bestRuns}`,
      average: ratio(acc.bowl.runs, acc.bowl.wickets),
      economy:
        acc.bowl.balls > 0
          ? Math.round((acc.bowl.runs / (acc.bowl.balls / DEFAULT_BALLS_PER_OVER)) * 100) / 100
          : null,
      strikeRate: ratio(acc.bowl.balls, acc.bowl.wickets),
      fiveFors: acc.bowl.fiveFors,
    };

    return {
      rank: 0,
      playerKey: acc.playerKey,
      playerName: acc.name,
      playerImage: acc.playerKey ? playerImageUrl(acc.playerKey) : null,
      team: acc.team,
      value: '',
      batting,
      bowling,
    };
  });

  return { rows, matchesCounted };
}

function rankStat(
  kind: SeriesStatKind,
  rows: SeriesStatRow[],
  matchesCounted: number,
  limit: number
): SeriesStatTable | null {
  const spec = STAT_SPECS[kind];
  const ranked = rows
    .filter(spec.qualifies)
    .sort((a, b) => {
      const ka = spec.keys(a);
      const kb = spec.keys(b);
      for (let i = 0; i < ka.length; i++) {
        if (kb[i] !== ka[i]) return kb[i] - ka[i];
      }
      return a.playerName.localeCompare(b.playerName);
    })
    .slice(0, limit)
    .map((row, i) => ({ ...row, rank: i + 1, value: spec.value(row) }));

  if (!ranked.length) return null;

  return {
    kind,
    label: spec.label,
    discipline: spec.discipline,
    rows: ranked,
    matchesCounted,
    qualifier: spec.qualifier,
  };
}

/**
 * One ranking for one series — the top `limit` players, with the batting or
 * bowling totals behind the figure.
 *
 * Returns null where the series has no completed card to read, which is every
 * series before its first result.
 */
export async function getApiSeriesStatTable(
  seriesKey: string,
  kind: SeriesStatKind,
  opts: FetchOpts & { limit?: number } = {}
): Promise<SeriesStatTable | null> {
  const totals = await seriesStatRows(seriesKey, opts);
  return totals ? rankStat(kind, totals.rows, totals.matchesCounted, opts.limit ?? 10) : null;
}

/** Several rankings off one read of the cards, rather than one read each. */
export async function getApiSeriesStatTables(
  seriesKey: string,
  kinds: SeriesStatKind[],
  opts: FetchOpts & { limit?: number } = {}
): Promise<Partial<Record<SeriesStatKind, SeriesStatTable | null>>> {
  const totals = await seriesStatRows(seriesKey, opts);
  return Object.fromEntries(
    kinds.map((kind) => [kind, totals ? rankStat(kind, totals.rows, totals.matchesCounted, opts.limit ?? 10) : null])
  );
}
