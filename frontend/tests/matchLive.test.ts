import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { InningsScore, Match, MatchEvent, Team } from '../types';
import { chaseOf, liveEquation, targetFromFeed } from '../lib/telemetry';
import { feedFromRows } from '../lib/api/commentary';
import {
  hasSuperOvers,
  inningsInProgress,
  momentsFor,
  regulationInnings,
} from '../components/match/inningsView';

const team = (id: string): Team => ({ id, name: id, shortName: id, country: id });
const inn = (teamId: string, runs: number, wickets: number, overs: number, extra: Partial<InningsScore> = {}): InningsScore =>
  ({ teamId, teamShortName: teamId, runs, wickets, overs, ...extra }) as InningsScore;
const match = (innings: InningsScore[], format: Match['format'] = 'T20'): Match => ({
  id: 'M',
  homeTeam: team('A'),
  awayTeam: team('B'),
  series: { id: 'S', name: 'S' },
  format,
  status: 'LIVE',
  venue: 'V',
  startTime: '2026-09-28T10:00:00Z',
  scorecard: { innings },
});

describe('inningsInProgress', () => {
  // A live first innings, with the XI yet to bat listed as an empty second innings.
  const card = [inn('A', 80, 2, 9.3), inn('B', 0, 0, 0, { notStarted: true })];

  it('reads the last batted innings as in progress, not the empty one after it', () => {
    assert.equal(inningsInProgress(card, 0, true), true);
    assert.equal(inningsInProgress(card, 1, true), false);
  });

  it('is never in progress between innings or once play is over', () => {
    assert.equal(inningsInProgress(card, 0, false), false);
  });

  it('only the chase is in progress once it has started', () => {
    const chase = [inn('A', 180, 6, 20), inn('B', 12, 0, 1.2)];
    assert.equal(inningsInProgress(chase, 0, true), false);
    assert.equal(inningsInProgress(chase, 1, true), true);
  });
});

describe('feed events carry their innings', () => {
  it('tags milestone, review and innings-end rows', () => {
    const { events } = feedFromRows([
      { type: 'pm', id: 1_700_000_000_000, inning: 0, overIndex: 9, name: 'X', text: 'Fifty' },
      { type: 'ic2', id: 1_700_000_100_000, inning: 0, overIndex: 19, text: 'Innings over' },
      { type: 'rc', id: 1_700_000_200_000, inning: 1, overIndex: 3, text: 'Not out' },
    ]);
    assert.deepEqual(
      events.map((e) => [e.kind, e.inning]),
      [
        ['MILESTONE', 0],
        ['INNINGS_END', 0],
        ['REVIEW', 1],
      ]
    );
  });
});

describe('momentsFor', () => {
  const ev = (id: string, inning: number | null): MatchEvent => ({ id, kind: 'MILESTONE', label: 'Milestone', over: 5, inning });
  const all = [ev('a', 0), ev('b', 1), ev('c', 2), ev('d', null)];

  it('keeps only the shown innings', () => {
    assert.deepEqual(momentsFor(all, [2], false).map((m) => m.id), ['c']);
  });

  it('lets an untagged event through only while every innings is drawn', () => {
    assert.deepEqual(momentsFor(all, [0, 1], true).map((m) => m.id), ['a', 'b', 'd']);
  });
});

describe('super overs', () => {
  const card = [inn('A', 180, 5, 20), inn('B', 180, 7, 20), inn('B', 12, 1, 1), inn('A', 13, 0, 0.5)];

  it('keeps a limited-overs score to the two regulation innings', () => {
    assert.equal(hasSuperOvers(card, 'T20'), true);
    assert.equal(regulationInnings(card, 'T20').length, 2);
  });

  it('leaves a Test alone', () => {
    assert.equal(hasSuperOvers(card, 'TEST'), false);
    assert.equal(regulationInnings(card, 'TEST').length, 4);
  });
});

describe('revised chase targets', () => {
  const first = inn('A', 200, 6, 20);
  const revised = { target: 150, balls: 90 };

  it('keeps the revision once the target is reached', () => {
    const m = match([first, inn('B', 150, 3, 14)]);
    assert.deepEqual(chaseOf(first, m.scorecard!.innings[1], m, 6, revised), { target: 150, limit: 90 });
    const eq = liveEquation(m, m.scorecard!.innings, revised)!;
    assert.equal(eq.target, 150);
    assert.equal(eq.need, 0);
  });

  it('keeps the revision once its balls are used up, flooring what is left', () => {
    const m = match([first, inn('B', 140, 3, 15)]);
    const eq = liveEquation(m, m.scorecard!.innings, revised)!;
    assert.equal(eq.target, 150);
    assert.equal(eq.need, 10);
    assert.equal(eq.ballsLeft, 0);
    assert.equal(eq.rrr, null);
  });

  it('keeps the revision on a last-ball win', () => {
    const m = match([first, inn('B', 154, 5, 15)]);
    assert.equal(liveEquation(m, m.scorecard!.innings, revised)!.target, 150);
  });

  it('falls back to first innings + 1 without a revision', () => {
    const m = match([first, inn('B', 40, 1, 5)]);
    assert.deepEqual(chaseOf(first, m.scorecard!.innings[1], m, 6, null), { target: 201, limit: 120 });
  });

  it('reads the newest target row when the feed holds two', () => {
    const rows: Array<Pick<MatchEvent, 'kind' | 'text' | 'timestamp'>> = [
      { kind: 'TARGET', text: 'B needs 201 runs in 120 balls', timestamp: '2026-09-28T12:00:00Z' },
      { kind: 'TARGET', text: 'B needs 150 runs in 90 balls', timestamp: '2026-09-28T13:30:00Z' },
      { kind: 'NOTE', text: 'B needs 10 runs in 6 balls', timestamp: '2026-09-28T14:00:00Z' },
    ];
    assert.deepEqual(targetFromFeed(rows), revised);
    assert.deepEqual(targetFromFeed([...rows].reverse()), revised);
  });

  it('lets a dated row replace one whose time cannot be read', () => {
    const rows: Array<Pick<MatchEvent, 'kind' | 'text' | 'timestamp'>> = [
      { kind: 'TARGET', text: 'B needs 201 runs in 120 balls', timestamp: 'not a time' },
      { kind: 'TARGET', text: 'B needs 150 runs in 90 balls', timestamp: '2026-09-28T13:30:00Z' },
    ];
    assert.deepEqual(targetFromFeed(rows), revised);
  });
});
