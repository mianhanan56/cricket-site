import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { InningsScore, Match, Team } from '../types';
import { keepNewest } from '../lib/liveScore';

const team = (id: string): Team => ({ id, name: id, shortName: id, country: id });
const inn = (runs: number, overs: number): InningsScore => ({ teamId: 'A', teamShortName: 'A', runs, wickets: 2, overs }) as InningsScore;
const match = (status: Match['status'], innings: InningsScore[]): Match => ({
  id: 'M',
  homeTeam: team('A'),
  awayTeam: team('B'),
  series: { id: 'S', name: 'S' },
  format: 'T20',
  status,
  venue: 'V',
  startTime: '2026-09-28T10:00:00Z',
  scorecard: { innings },
});

describe('keepNewest', () => {
  it('drops a snapshot that is behind the one shown', () => {
    const shown = match('LIVE', [inn(91, 13.1)]);
    assert.equal(keepNewest([shown], [match('LIVE', [inn(85, 13)])])[0], shown);
  });

  it('takes a snapshot that moved on', () => {
    const fresh = match('LIVE', [inn(92, 13.2)]);
    assert.equal(keepNewest([match('LIVE', [inn(91, 13.1)])], [fresh])[0], fresh);
  });

  it('never un-finishes a match or un-starts an innings', () => {
    const done = match('COMPLETED', [inn(150, 20), inn(151, 19.2)]);
    assert.equal(keepNewest([done], [match('LIVE', [inn(150, 20), inn(140, 18)])])[0], done);
    const second = match('LIVE', [inn(150, 20), inn(4, 0.3)]);
    assert.equal(keepNewest([second], [match('LIVE', [inn(150, 20)])])[0], second);
  });

  it('passes through matches it has not seen', () => {
    const n = match('UPCOMING', []);
    assert.equal(keepNewest([], [n])[0], n);
  });
});
