import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { feedFromRows, richText, type ApiFeedRow } from '../lib/api';

// Rows from ENG v SL, 3rd ODI 2026 (13ND), as the Worker serves them.
const notesOf = (...rows: ApiFeedRow[]) => feedFromRows(rows).notes;

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
  it('reads a bowler card: innings, wickets, economy', () => {
    const [n] = notesOf({ type: 'ps', id: 1792671986492, inning: 1, discipline: '0', name: 'Gus Atkinson', playerKey: '46Y', age: '28', rank: 65, innings: 17, total: 23, rate: 6.057, average: 32.3 });
    assert.equal(n.kind, 'player');
    assert.ok(n.kind === 'player');
    assert.equal(n.role, 'bowler');
    assert.equal(n.rank, 65);
    assert.equal(n.age, 28);
    assert.deepEqual(n.career, { innings: 17, total: 23, average: 32.3, rate: 6.057 });
  });

  it('reads an opener and leaves an unranked player unranked', () => {
    const [n] = notesOf({ type: 'ps', id: 1, inning: 1, discipline: '1', battingPosition: 2, name: 'Avishka Fernando', playerKey: 'YL', rank: -1, innings: 51, total: 1594, average: 31.25, rate: 88.75 });
    assert.ok(n.kind === 'player');
    assert.equal(n.role, 'batter');
    assert.equal(n.position, 2);
    assert.equal(n.rank, null);
  });

  it('reads a review decision from its codes', () => {
    const [n] = notesOf({ type: 'rc', id: 2, inning: 1, reviewedBy: 0, result: '0', ultraEdge: '1', battingTeamKey: 'T', bowlingTeamKey: 'S', reviewsLeft: { S: 2, T: 2 } });
    assert.deepEqual(
      { kind: n.kind, ...(n.kind === 'decision' ? { by: n.by, out: n.out, edge: n.ultraEdge, left: n.reviewsLeft } : {}) },
      { kind: 'decision', by: 'batting', out: false, edge: true, left: { S: 2, T: 2 } }
    );
  });

  it('skips polls, empty review notices and deliveries', () => {
    const notes = notesOf(
      { type: 'pl', id: 3, inning: 0 },
      { type: 'ac', id: 4, inning: 1, text: '', reviewsLeft: { S: 2, T: 2 } },
      { type: 'b', id: 5, inning: 1, over: '0.1', outcome: '4', headline: 'Gus Atkinson to Kamindu Mendis' }
    );
    assert.deepEqual(notes, []);
  });
});
