import { fields, type Shaper } from '../shape';

const matchRef = fields({ mf: 'matchKey' });

const battingStats = fields({
  m: 'matches',
  i: 'innings',
  r: 'runs',
  hd: 'hundreds',
  ff: 'fifties',
  hs: 'highScore',
  sr: 'strikeRate',
  av: 'average',
  fr: 'fours',
  sx: 'sixes',
  // The wire sends `du`; the upstream's own page reads `dk`. `du` is listed last so it wins.
  dk: 'ducks',
  du: 'ducks',
  hsm: ['highScoreMatch', matchRef],
  btd: 'debut',
  btdm: ['debutMatch', matchRef],
});

const bowlingStats = fields({
  m: 'matches',
  i: 'innings',
  w: 'wickets',
  bf: 'bestFigures',
  ec: 'economy',
  w3: 'threeWickets',
  w5: 'fiveWickets',
  bav: 'average',
  bsr: 'strikeRate',
  bod: 'debut',
  bodm: ['debutMatch', matchRef],
});

const careerRow = (stats: Shaper) => fields({ st: 'competition', ft: 'format', s: ['stats', stats] });

const formRow = {
  mf: 'matchKey',
  st: 'competition',
  mt: 'format',
  dt: 'startTime',
  vs: 'opponentKey',
  t1f: 'team1Key',
  t2f: 'team2Key',
  r: 'runs',
} as const;

const seriesInnings = fields({
  mf: 'matchKey',
  mn: 'matchNumber',
  i: 'inningsOfMatch',
  r: 'runs',
  b: 'balls',
  w: 'wickets',
  di: 'dismissed',
  vs: 'opponentKey',
  d: 'startTime',
  fo: 'formatName',
});

export const shapes: Record<string, Shaper> = {
  '/player/overview': fields({
    a: [
      'profile',
      fields({
        bsi: [
          'info',
          fields({
            fn: 'fullName',
            dob: 'birthDate',
            pob: 'birthPlace',
            h: 'height',
            n: 'nationality',
            tm: 'teams',
            iu: 'instagram',
            tu: 'twitter',
            rl: 'role',
            bts: 'battingHand',
            bp: 'battingPosition',
            bwl: 'bowlingType',
            bs: 'bowlingStyle',
            ps: 'popularShot',
            g: 'gender',
          }),
        ],
        sts: [
          'career',
          fields({ bt: ['batting', careerRow(battingStats)], bl: ['bowling', careerRow(bowlingStats)] }),
        ],
      }),
    ],
    b: ['rankings', fields({ ft: 'format', pos: 'position', type: 'discipline' })],
    c: [
      'recentForm',
      fields({
        btf: ['batting', fields({ ...formRow, b: 'balls', di: 'dismissed' })],
        // On a bowling row `b` is wickets taken, not balls.
        bof: ['bowling', fields({ ...formRow, b: 'wickets' })],
      }),
    ],
    d: ['contracts', fields({ tf: 'teamKey', st: 'competition' })],
    h: ['formatsPlayed', fields({ ft: 'format' })],
  }),
  '/player/matches': fields({
    sf: 'seriesKey',
    st: 'competition',
    pft: 'teamKey',
    sd: 'startDate',
    ed: 'endDate',
    d: ['formats', fields({ f: 'format', ir: ['innings', seriesInnings] })],
  }),
};
