import { fields, keyed, type Rename, type Shaper } from '../shape';

// /rankings/players serves player rows ({r, tf, pf, pr, pos}) or, with category=team,
// team rows ({r, p, m, tf}); one map covers both.
const rankingRow = fields({
  pos: 'position',
  pr: 'previousPosition',
  pf: 'playerKey',
  tf: 'teamKey',
  r: 'rating',
  p: 'points',
  m: 'matches',
});

const tableRow = fields({
  team_fkey: 'teamKey',
  team_name: 'teamName',
  P: 'played',
  W: 'won',
  L: 'lost',
  NR: 'noResult',
  Draw: 'drawn',
  Pts: 'points',
  NRR: 'netRunRate',
  rf: 'form',
  qualified: 'qualified',
  eliminated: 'eliminated',
  is_winner: 'champion',
});

// Only the footnote figure the site prints under each category; `ms` also sends an unused `sr`.
const leader = (footnote: Rename = {}) =>
  fields({ pf: 'playerKey', tf: 'teamKey', v: 'value', bi: 'innings', ...footnote });

const leaderBlock = fields({
  mr: ['mostRuns', leader({ sr: 'strikeRate' })],
  mw: ['mostWickets', leader({ econ: 'economy' })],
  hs: ['highestScore', leader({ sr: 'strikeRate' })],
  bf: ['bestFigures', leader()],
  ms: ['mostSixes', leader()],
  mf: ['mostFours', leader()],
  bsr: ['bestStrikeRate', leader({ r: 'runs' })],
  bec: ['bestEconomy', leader({ w: 'wickets' })],
  totals: ['totals', fields({ t4: 'fours', t6: 'sixes' })],
});

const asRecord = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

// A multi-format tour sends a block per leg; the site shows only the active one, else the first.
const shownLeg: Shaper = (value) => {
  const { af, i } = asRecord(value);
  const legs = asRecord(i);
  const leg = String(af ?? '') in legs ? String(af) : Object.keys(legs)[0];
  return { activeFormat: af, byFormat: leg === undefined ? {} : { [leg]: leaderBlock(legs[leg]) } };
};

export const shapes: Record<string, Shaper> = {
  '/rankings': keyed(rankingRow),
  '/rankings/players': rankingRow,
  '/series/table': fields({ g_name: 'name', pt_info: ['rows', tableRow] }),
  '/series/overview': fields({ i4: ['leaders', shownLeg] }),
};
