import { fields, keyed, type Shaper } from '../shape';
import { UPSTREAM_SITE } from '../upstream';

// The upstream lists itself as a co-streamer ("<site> & FANCODE"); the site never names it.
const SITE_NAME = new URL(UPSTREAM_SITE).hostname.split('.')[0].toLowerCase();
const withoutSource: Shaper = (value) =>
  typeof value === 'string'
    ? value
        .split(',')
        .map((entry) =>
          entry
            .split('&')
            .map((name) => name.trim())
            .filter((name) => name && name.toLowerCase() !== SITE_NAME)
            .join(' & ')
        )
        .filter(Boolean)
        .join(', ')
    : value;

const seriesRow = fields({
  mf: 'matchKey',
  id: 'id',
  t1f: 'team1Key',
  t2f: 'team2Key',
  vf: 'venueKey',
  mn: 'matchNumber',
  t: 'startTime',
  s: 'status',
  r: 'result',
  ft: 'format',
});

// The team page lists only fixtures to come, with no ground or match number.
const teamRow = fields({
  mf: 'matchKey',
  id: 'id',
  t1f: 'team1Key',
  t2f: 'team2Key',
  t: 'startTime',
  s: 'status',
  ft: 'format',
});

export const shapes: Record<string, Shaper> = {
  '/match/info': fields({
    t: 'teamKeys',
    tb: 'squads',
    tp: 'playingElevens',
    x: 'captainAndKeeperKeys',
    u: 'umpireKeys',
    s: 'seriesKey',
    v: 'venueKey',
    dt: 'scheduledStart',
    nt: 'nextPlayTime',
    b: ['broadcasters', withoutSource],
    wU: [
      'weather',
      fields({
        crT: 'temperature',
        mnT: 'minTemperature',
        mxT: 'maxTemperature',
        wC: 'condition',
        hum: 'humidity',
        rP: 'rainChance',
        wS: 'windSpeed',
      }),
    ],
    vsp: [
      'venueRecord',
      fields({
        t: 'label',
        tm: 'matches',
        a1: 'firstInningsAverage',
        a2: 'secondInningsAverage',
        a3: 'thirdInningsAverage',
        a4: 'fourthInningsAverage',
        h: 'highest',
        l: 'lowest',
        x: 'wonBattingFirst',
        y: 'wonBowlingFirst',
      }),
    ],
  }),
  // Grouped by date ("2026/7/21").
  '/series/matches': keyed(seriesRow),
  // Grouped by series key.
  '/team/matches': keyed(teamRow),
};
