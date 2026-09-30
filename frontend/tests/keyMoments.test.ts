import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { InningsScore, MatchEvent } from '../types';
import { keyMoments } from '../lib/keyMoments';

const inn = (team: string, fow: Array<[string, number, number, number]>): InningsScore => ({
  teamId: team,
  teamShortName: team,
  runs: 0,
  wickets: fow.length,
  overs: 0,
  fallOfWickets: fow.map(([name, playerRuns, runs, overs], i) => ({ wicket: i + 1, name, playerRuns, playerBalls: playerRuns + 1, runs, overs, playerId: name })),
});

describe('key moments', () => {
  it('adds scorecard wickets the feed page no longer carries, newest first', () => {
    const feed: MatchEvent[] = [{ id: '9', kind: 'MILESTONE', label: 'Milestone', text: 'John Campbell — Scored 100 in 65 Balls', over: 18 }];
    const out = keyMoments(feed, [inn('WI', [['Keacy Carty', 9, 37, 4.3], ['Shai Hope', 40, 150, 17.6]])]);
    assert.deepEqual(out.map((e) => [e.kind, e.over, e.text]), [
      ['MILESTONE', 18, 'John Campbell — Scored 100 in 65 Balls'],
      ['WICKET', 18, 'Shai Hope out for 40 (41) · WI 150/2'],
      ['WICKET', 5, 'Keacy Carty out for 9 (10) · WI 37/1'],
    ]);
  });

  it('keeps the feed’s own wicket instead of repeating it', () => {
    const feed: MatchEvent[] = [{ id: '1', kind: 'WICKET', label: 'Wicket', text: 'Keacy Carty c Dhir b Krishna 9(10)', over: 5 }];
    const out = keyMoments(feed, [inn('WI', [['Keacy Carty', 9, 37, 4.3]])]);
    assert.equal(out.length, 1);
    assert.equal(out[0].id, '1');
  });

  it('puts the toss after every wicket and orders later innings first', () => {
    const feed: MatchEvent[] = [{ id: 't', kind: 'TOSS', label: 'Toss', text: 'WI won the toss', over: null }];
    const out = keyMoments(feed, [inn('WI', [['A One', 1, 5, 1.2]]), inn('IND', [['B Two', 2, 8, 2.1]])]);
    assert.deepEqual(out.map((e) => e.id), ['fow:1:1', 'fow:0:1', 't']);
  });
});
