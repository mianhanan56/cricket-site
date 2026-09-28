import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { filterDirectory, type DirectoryRow } from '../lib/playersDirectory';

const row = (id: string, name: string, gender: DirectoryRow['gender'], rankings: DirectoryRow['rankings']): DirectoryRow => ({
  id,
  name,
  country: 'India',
  gender,
  crest: null,
  rankings,
});

const ROWS: DirectoryRow[] = [
  row('a', 'Alpha', 'MEN', [
    { role: 'BATTING', format: 'ODI', position: 3, rating: 700 },
    { role: 'BATTING', format: 'TEST', position: 1, rating: 880 },
  ]),
  row('b', 'Bravo', 'MEN', [
    { role: 'ALLROUNDER', format: 'T20I', position: 1, rating: 250 },
    { role: 'BOWLING', format: 'T20I', position: 8, rating: 640 },
  ]),
  row('c', 'Charlie', 'WOMEN', [{ role: 'BATTING', format: 'ODI', position: 2, rating: 760 }]),
];

const all = { gender: 'men', role: 'all', format: 'all', query: '' } as const;

describe('filterDirectory', () => {
  it('lists a player under every discipline they are ranked in', () => {
    const sections = filterDirectory(ROWS, all);
    assert.deepEqual(
      sections.map((s) => [s.role, s.items.map((i) => i.row.id)]),
      [
        ['BATTING', ['a']],
        ['BOWLING', ['b']],
        ['ALLROUNDER', ['b']],
      ]
    );
  });

  it('ranks by the best format and keeps the rest of that discipline as others', () => {
    const [batting] = filterDirectory(ROWS, { ...all, role: 'batting' });
    const alpha = batting.items[0];
    assert.equal(alpha.best.format, 'TEST');
    assert.deepEqual(alpha.others.map((o) => o.format), ['ODI']);
  });

  it('shows the chosen format position and drops players not ranked in it', () => {
    const sections = filterDirectory(ROWS, { ...all, format: 'odi' });
    assert.equal(sections.length, 1);
    assert.equal(sections[0].items[0].best.position, 3);
    assert.deepEqual(sections[0].items[0].others, []);
  });

  it('combines gender, role and search', () => {
    assert.deepEqual(filterDirectory(ROWS, { ...all, gender: 'women', role: 'bowling' }), []);
    assert.equal(filterDirectory(ROWS, { ...all, gender: 'women', query: 'char' })[0].items.length, 1);
    assert.deepEqual(filterDirectory(ROWS, { ...all, query: 'zulu' }), []);
  });
});
