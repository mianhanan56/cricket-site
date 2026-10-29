import { fields, type Rename, type Shaper } from '../shape';

const row: Rename = { type: 'type', id: 'id', inning: 'inning' };
const note: Rename = { ...row, c: 'text' };
// Toss, target and note rows carry an `on` too, but it is no over the site shows.
const event: Rename = { ...note, on: 'overIndex' };

// The upstream reuses its letters across row types (`s` is a delivery's score, a milestone's
// runs and a wicket card's sixes), so each `type` has its own map.
const byType = new Map<string, Shaper>([
  ['b', fields({ ...row, b: 'outcome', o: 'over', s: 'score', pf: 'strikerKey', bf: 'bowlerKey', c1: 'headline', c2: 'text' })],
  [
    'o',
    fields({
      ...row,
      on: 'overIndex',
      runs: 'runs',
      ow: 'wickets',
      rb: 'outcomes',
      s: 'score',
      team: 'battingTeamName',
      p1: 'batter1Name',
      pf1: 'batter1Key',
      s1: 'batter1Score',
      p2: 'batter2Name',
      pf2: 'batter2Key',
      s2: 'batter2Score',
      bowler: 'bowlerName',
      bf: 'bowlerKey',
      bd: 'bowlerFigures',
    }),
  ],
  [
    'w',
    fields({
      ...event,
      player_fullname: 'name',
      player_fkey: 'playerKey',
      wn: 'wicketNumber',
      r: 'runs',
      b: 'balls',
      f: 'fours',
      s: 'sixes',
      sr: 'strikeRate',
      wicketDesc: 'howOut',
    }),
  ],
  ['pm', fields({ ...event, n: 'name', pf: 'playerKey', s: 'runs', b: 'balls' })],
  ['tm', fields({ ...event, n: 'name', s: 'runs' })],
  ['ic2', fields({ ...event, n: 'name', score: 'score', o: 'overs' })],
  ['tc', fields({ ...note, rrr: 'requiredRunRate' })],
  ['to', fields(note)],
  ['t', fields({ ...note, sub_type: 'subType' })],
  ['ac', fields({ ...event, review_left: 'reviewsLeft' })],
  [
    'rc',
    fields({
      ...event,
      review_type: 'reviewedBy',
      result: 'result',
      ultraedge: 'ultraEdge',
      tbf: 'battingTeamKey',
      tbwf: 'bowlingTeamKey',
      review_left: 'reviewsLeft',
    }),
  ],
  [
    'ps',
    fields({
      ...row,
      pf: 'playerKey',
      n: 'name',
      cat: 'discipline',
      r: 'rank',
      age: 'age',
      bp: 'battingPosition',
      match: 'innings',
      runs: 'total',
      avg: 'average',
      sr: 'rate',
    }),
  ],
  [
    'pbc',
    fields({
      ...row,
      batsman_fkey: 'batterKey',
      bowler_fkey: 'bowlerKey',
      fd: 'format',
      since: 'since',
      innings: 'innings',
      runs: 'runs',
      ball_faced: 'balls',
      out_count: 'dismissals',
      strike_rate: 'strikeRate',
    }),
  ],
  [
    'pvtc',
    fields({
      ...row,
      player_fkey: 'playerKey',
      oppn_team_fkey: 'opponentKey',
      fd: 'format',
      innings: 'innings',
      runs: 'runs',
      batting_average: 'average',
      strike_rate: 'strikeRate',
    }),
  ],
]);

// Polls, tweets, day highlights and the rest have no reader, but their ids still page the feed.
const other = fields(row);

const feedRow: Shaper = (value) => {
  const type = typeof value === 'object' && value !== null ? (value as { type?: unknown }).type : undefined;
  return ((typeof type === 'string' && byType.get(type)) || other)(value);
};

export const shapes: Record<string, Shaper> = {
  '/match/commentary': (body) => (Array.isArray(body) ? body.map(feedRow) : body),
};
