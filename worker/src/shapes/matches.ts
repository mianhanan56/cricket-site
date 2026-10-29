import { fields, keyed, rename, type Rename, type Shaper } from '../shape';

const liveMatch = fields({
  a: 'statusCode',
  ac: 'statusDetail',
  res: 'statusText',
  b: 'team1Key',
  c: 'team2Key',
  q: 'seriesKey',
  v: 'venueKey',
  e: 'matchNumber',
  fo: 'format',
  hb: 'ballsPerOver',
  n: 'packedState',
  d: 'currentInnings',
  s: 'session',
  // Innings scores in batting order; a follow-on puts team 2 in the third slot.
  j: 'firstInningsScore',
  k: 'secondInningsScore',
  l: 'thirdInningsScore',
  m: 'fourthInningsScore',
  ti: 'startTime',
  finishTime: 'finishTime',
  mm: 'playerOfMatch',
});

const eachLine =
  (trim: (line: string) => string) =>
  (value: unknown): unknown =>
    Array.isArray(value) ? value.map((line) => (typeof line === 'string' ? trim(line) : line)) : value;

const scorecardInnings: Rename = {
  c: 'teamKey',
  d: 'total',
  e: 'extras',
  // After the "/" is the batter's wagon-wheel data, which the site doesn't draw.
  b: ['batting', eachLine((line) => line.split('/')[0])],
  // An optional sixth field counts dot balls; nothing shows it.
  a: ['bowling', eachLine((line) => line.split('.').slice(0, 5).join('.'))],
  p: 'partnerships',
};

export const shapes: Record<string, Shaper> = {
  // Stays keyed by match id: the live hub diffs it match by match.
  '/matches/live': keyed(liveMatch),
  // Usually an array of innings; an object keyed "0", "1" has also been seen.
  '/match/scorecard': (value) =>
    Array.isArray(value) ? rename(value, scorecardInnings) : keyed(fields(scorecardInnings))(value),
};
