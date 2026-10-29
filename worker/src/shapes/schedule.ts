import { fields, keyed, type Shaper } from '../shape';

const fixtureRow = fields({
  mf: 'matchKey',
  id: 'id',
  t1f: 'team1Key',
  t2f: 'team2Key',
  sf: 'seriesKey',
  vf: 'venueKey',
  t: 'startTime',
  status: 'status',
  ft: 'format',
  result: 'result',
});

const seriesMonths = keyed(fields({ sf: 'seriesKey', tp: 'dateRange' }));

export const shapes: Record<string, Shaper> = {
  // wise=1 is an array of matches, wise=2 months of series. wise=3 maps team ids to key
  // strings, which `keyed` hands back untouched.
  '/fixtures': (body) => (Array.isArray(body) ? fixtureRow(body) : seriesMonths(body)),
  '/series/squads': fields({
    tf: 'teamKey',
    pf: 'playerKeys',
    c: 'captainKeys',
    iw: 'wicketKeeperKeys',
  }),
};
