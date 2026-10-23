import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { feedFromRows, richText, type ApiFeedRow } from '../lib/api';

// Rows as the upstream sent them on ENG v SL, 3rd ODI 2026 (13ND).
const row = (r: Record<string, unknown>) => ({ mfkey: '13ND', sh: 1, fv: 1, ...r }) as unknown as ApiFeedRow;
const notesOf = (...rows: Array<Record<string, unknown>>) => feedFromRows(rows.map(row)).notes;

describe('commentary markup', () => {
  it('keeps headings, bold lines and paragraphs as runs', () => {
    const paras = richText(
      '<b><u>Highest Individual Scores as Captain in ODIs: <br></u></b><br>222* - Shubman Gill (India) vs West Indies, Guwahati, 2026 <br><b>202 - Harry Brook (England) vs Sri Lanka, Rawalpindi, 2026, Today*</b>'
    );
    assert.deepEqual(paras, [
      [[{ text: 'Highest Individual Scores as Captain in ODIs:', strong: true, title: true }]],
      [
        [{ text: '222* - Shubman Gill (India) vs West Indies, Guwahati, 2026' }],
        [{ text: '202 - Harry Brook (England) vs Sri Lanka, Rawalpindi, 2026, Today*', strong: true }],
      ],
    ]);
  });

  it('decodes entities and drops tags it has no run for', () => {
    assert.deepEqual(richText('Sachindu Colombage OUT,&nbsp;Dunith Wellalage IN<div>A &amp; B</div><img src=x onerror=alert(1)>'), [
      [[{ text: 'Sachindu Colombage OUT, Dunith Wellalage IN' }], [{ text: 'A & B' }]],
    ]);
  });
});

describe('notes between the balls', () => {
  it('reads a bowler card: innings, wickets, economy, best', () => {
    const [n] = notesOf({ type: 'ps', id: 1792671986492, inning: 1, cat: '0', n: 'Gus Atkinson', pf: '46Y', tf: 'S', age: '28', r: 65, match: 17, runs: 23, sr: 6.057, avg: 32.3, c: '3/50' });
    assert.equal(n.kind, 'player');
    assert.ok(n.kind === 'player');
    assert.equal(n.role, 'bowler');
    assert.equal(n.rank, 65);
    assert.deepEqual(n.career, { innings: 17, total: 23, average: 32.3, rate: 6.057, best: '3/50' });
  });

  it('reads an opener and leaves an unranked player unranked', () => {
    const [n] = notesOf({ type: 'ps', id: 1, inning: 1, cat: '1', bp: 2, n: 'Avishka Fernando', pf: 'YL', r: -1, match: 51, runs: 1594, avg: 31.25, sr: 88.75, c: 127 });
    assert.ok(n.kind === 'player');
    assert.equal(n.role, 'batter');
    assert.equal(n.position, 2);
    assert.equal(n.rank, null);
    assert.equal(n.career.best, '127');
  });

  it('reads a review decision from its codes', () => {
    const [n] = notesOf({ type: 'rc', id: 2, inning: 1, review_type: 0, result: '0', ultraedge: '1', tbf: 'T', tbwf: 'S', review_left: { S: 2, T: 2 } });
    assert.deepEqual(
      { kind: n.kind, ...(n.kind === 'decision' ? { by: n.by, out: n.out, edge: n.ultraEdge, left: n.reviewsLeft } : {}) },
      { kind: 'decision', by: 'batting', out: false, edge: true, left: { S: 2, T: 2 } }
    );
  });

  it('skips polls, empty review notices and deliveries', () => {
    const notes = notesOf(
      { type: 'pl', id: 3, inning: 0, c: { q: 'Will Harry Brook complete his double century?' } },
      { type: 'ac', id: 4, inning: 1, c: '', review_left: { S: 2, T: 2 } },
      { type: 'b', id: 5, inning: 1, o: '0.1', b: '4', c1: 'Gus Atkinson to Kamindu Mendis' }
    );
    assert.deepEqual(notes, []);
  });
});
