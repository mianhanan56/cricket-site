import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Fixture } from '../lib/api';
import { packFixtures, unpackFixtures } from '../lib/fixturePack';

const team = (id: string, name = id) => ({ id, name, shortName: id, country: name, logo: null });
const fixture = (id: string, home: Fixture['homeTeam'], away: Fixture['homeTeam']): Fixture => ({
  id,
  matchKey: id,
  homeTeam: home,
  awayTeam: away,
  series: { id: 'S', name: 'Series' },
  format: 'T20',
  status: 'UPCOMING',
  venue: 'Ground',
  venueId: null,
  startTime: '2026-10-29T14:00:00.000Z',
  result: null,
});

describe('packing fixtures', () => {
  it('sends each team and series once and rebuilds the same rows', () => {
    const rows = [fixture('1', team('A'), team('B')), fixture('2', team('B'), team('A')), fixture('3', team('A'), team('C'))];
    const packed = packFixtures(rows);
    assert.equal(packed.teams.length, 3);
    assert.equal(packed.series.length, 1);
    assert.deepEqual(unpackFixtures(packed), rows);
  });

  it('keeps two different sides that share an id apart', () => {
    const rows = [fixture('1', team('', 'Winner SF1'), team('', 'Winner SF2'))];
    assert.deepEqual(unpackFixtures(packFixtures(rows)), rows);
  });
});
