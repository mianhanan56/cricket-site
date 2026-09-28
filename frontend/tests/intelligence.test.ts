// The derived readings the redesign shows: telemetry, state families, the
// pulse, the momentum worm and the automation triggers. Each must come out of
// feed data and nothing else.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { InningsScore, Match, MatchNote, OverSummary, Team } from '../types';
import { liveEquation, inningsProgress } from '../lib/telemetry';
import { matchStateOf } from '../lib/matchState';
import { matchPulse, pulseTrace, recentInningsBalls, type PulseBall } from '../lib/pulse';
import { inningsWorms } from '../lib/momentum';
import { listFirings, feedFirings, describeAutomation } from '../lib/automations';

const team = (id: string): Team => ({ id, name: id, shortName: id, country: id });
const inn = (teamId: string, runs: number, wickets: number, overs: number, extra: Partial<InningsScore> = {}): InningsScore => ({
  teamId,
  teamShortName: teamId,
  runs,
  wickets,
  overs,
  ...extra,
});

function match(over: Partial<Match> = {}): Match {
  return {
    id: 'M1',
    homeTeam: team('PAK'),
    awayTeam: team('ENG'),
    series: { id: 'S1', name: 'Cup' },
    format: 'T20',
    status: 'LIVE',
    venue: 'Lahore',
    startTime: '2026-09-25T10:00:00.000Z',
    ballsPerOver: 6,
    ...over,
  };
}

const chase = (runs: number, wickets: number, overs: number) =>
  match({
    scorecard: {
      innings: [inn('ENG', 197, 8, 20, { phase: 'COMPLETED' }), inn('PAK', runs, wickets, overs, { phase: 'CURRENT' })],
    },
  });

const ball = (i: number, runs: number, extra: Partial<PulseBall> = {}): PulseBall => ({
  id: String(1000 + i),
  over: Math.floor(i / 6),
  ball: (i % 6) + 1,
  runs,
  batRuns: runs,
  extra: null,
  isWicket: false,
  inning: 1,
  ...extra,
});

describe('liveEquation', () => {
  it('reads a chase off the CURRENT marker regardless of slot order', () => {
    const eq = liveEquation(chase(142, 4, 17.3));
    assert.ok(eq);
    assert.equal(eq.battingTeam.id, 'PAK');
    assert.equal(eq.target, 198);
    assert.equal(eq.need, 56);
    assert.equal(eq.ballsLeft, 15);
    assert.equal(eq.phase, 'DEATH');
    assert.ok(eq.rrr && Math.abs(eq.rrr - 22.4) < 0.01);
  });

  it('has no chase in a first innings, and no phase in a Test', () => {
    const first = liveEquation(match({ scorecard: { innings: [inn('PAK', 40, 1, 5.2, { phase: 'CURRENT' })] } }));
    assert.equal(first?.target, null);
    assert.equal(first?.phase, 'POWERPLAY');
    const test = liveEquation(match({ format: 'TEST', scorecard: { innings: [inn('PAK', 300, 4, 80, { phase: 'CURRENT' })] } }));
    assert.equal(test?.phase, null);
    assert.equal(inningsProgress(match({ format: 'TEST', scorecard: { innings: [inn('PAK', 300, 4, 80, { phase: 'CURRENT' })] } })), null);
  });

  it('is null for a match that is not live', () => {
    assert.equal(liveEquation(match({ status: 'COMPLETED' })), null);
  });
});

describe('matchStateOf', () => {
  const note = (label: string, kind: MatchNote['kind'], extra: Partial<MatchNote> = {}): MatchNote => ({
    label,
    kind,
    paused: true,
    ...extra,
  });

  it('gives every stoppage its own family', () => {
    assert.equal(matchStateOf(match({ note: note('Rain Delay', 'DELAY') })).family, 'weather');
    assert.equal(matchStateOf(match({ note: note('Stumps', 'STUMPS') })).family, 'dormant');
    assert.equal(matchStateOf(match({ note: note('Tea Break', 'BREAK') })).key, 'TEA');
    assert.equal(matchStateOf(match({ note: note('Innings Break', 'BREAK', { betweenInnings: true }) })).family, 'transition');
    assert.equal(matchStateOf(match({ note: note('Match Paused', 'SUSPENDED') })).family, 'hold');
    assert.equal(matchStateOf(match()).family, 'live');
  });

  it('reads terminal states from the note or the result', () => {
    assert.equal(matchStateOf(match({ status: 'COMPLETED', result: 'Match tied' })).key, 'TIED');
    assert.equal(matchStateOf(match({ status: 'COMPLETED', note: note('Abandoned', 'SUSPENDED', { paused: false }) })).family, 'void');
    assert.equal(matchStateOf(match({ status: 'COMPLETED', result: 'PAK won by 5 runs' })).key, 'FINISHED');
    assert.equal(matchStateOf(match({ status: 'UPCOMING', note: note('Toss delayed due to wet outfield', 'DELAY', { preToss: true }) })).key, 'RAIN');
  });
});

describe('pulse', () => {
  it('stays silent on fewer than six legal balls', () => {
    assert.equal(matchPulse([ball(0, 4), ball(1, 0)], 'T20', 6), null);
  });

  it('builds each meter from the figure it prints', () => {
    const window = [ball(0, 0), ball(1, 4), ball(2, 6), ball(3, 0), ball(4, 1), ball(5, 0, { isWicket: true })];
    const r = matchPulse(window, 'T20', 6);
    assert.ok(r);
    const by = Object.fromEntries(r.map((x) => [x.key, x]));
    assert.equal(by.momentum.figure, '11.0 rpo');
    assert.equal(by.pressure.figure, '50% dots');
    assert.equal(by.boundaries.figure, '2 in 6');
    assert.equal(by.wickets.figure, '1 wkt');
  });

  it('keeps the window inside the innings in progress', () => {
    const newestFirst = [ball(2, 1), ball(1, 1), ball(0, 1, { inning: 0 })];
    assert.deepEqual(recentInningsBalls(newestFirst).map((b) => b.id), ['1001', '1002']);
  });

  it('drops a wicket below the line and spikes a six', () => {
    const t = pulseTrace([ball(0, 6), ball(1, 0, { isWicket: true })]);
    assert.equal(t[0].level, 1);
    assert.ok(t[1].level < 0);
  });
});

describe('inningsWorms', () => {
  it('plots only reported scores and dedupes repeated over rows', () => {
    const card = [
      inn('PAK', 60, 2, 8, {
        phase: 'CURRENT',
        fallOfWickets: [
          { wicket: 1, runs: 10, overs: 2.3, playerId: 'a', name: 'A', playerRuns: 5, playerBalls: 6 },
          { wicket: 2, runs: 41, overs: 6, playerId: 'b', name: 'B', playerRuns: 20, playerBalls: 15 },
        ],
      }),
    ];
    const over = (id: string, n: number, runs: number, score: string): OverSummary => ({
      id,
      over: n,
      inning: 0,
      runs,
      wickets: 0,
      balls: [],
      score,
      battingTeam: 'PAK',
      batsmen: [],
      bowler: null,
    });
    const [w] = inningsWorms(card, [over('1', 5, 8, '35/1'), over('2', 5, 9, '36/1'), over('3', 7, 4, '52/2')], [], 6);
    assert.deepEqual(
      w.points.map((p) => [p.balls, p.runs]),
      [[0, 0], [15, 10], [30, 36], [36, 41], [42, 52], [48, 60]]
    );
    assert.equal(w.bars.length, 2);
    assert.equal(w.bars[0].runs, 9);
  });
});

describe('automation triggers', () => {
  it('fires on start, wicket, tight chase and result — and only on change', () => {
    const upcoming = match({ status: 'UPCOMING' });
    assert.deepEqual(listFirings([upcoming], [match()]).map((f) => f.trigger), ['MATCH_START']);

    const before = chase(142, 4, 17.3);
    const after = chase(142, 5, 17.4);
    assert.deepEqual(listFirings([before], [after]).map((f) => f.trigger), ['WICKET']);
    assert.deepEqual(listFirings([after], [after]), []);

    const easy = chase(150, 2, 15);
    const tight = chase(151, 2, 16);
    assert.ok(listFirings([easy], [tight]).some((f) => f.trigger === 'CLOSE_CHASE'));

    const done = { ...after, status: 'COMPLETED' as const, result: 'ENG won by 20 runs' };
    assert.deepEqual(listFirings([after], [done]).map((f) => f.trigger), ['RESULT']);
  });

  it('reads sixes and milestones off new feed rows only', () => {
    const seenBalls = new Set<string>();
    const seenEvents = new Set<string>();
    const m = match();
    const first = feedFirings(m, [ball(0, 6)], [], seenBalls, seenEvents);
    assert.equal(first[0].trigger, 'SIX');
    assert.equal(feedFirings(m, [ball(0, 6)], [], seenBalls, seenEvents).length, 0);
    const ms = feedFirings(
      m,
      [],
      [{ id: 'e1', kind: 'MILESTONE', label: 'Milestone', text: 'Babar Azam — Scored 50 in 31 Balls', over: 9 }],
      seenBalls,
      seenEvents
    );
    assert.equal(ms[0].trigger, 'FIFTY');
    assert.equal(ms[0].player, 'Babar Azam');
  });

  it('describes a rule in plain words', () => {
    assert.equal(
      describeAutomation({ trigger: 'WICKET', scope: { kind: 'TEAM', id: 'PAK', name: 'Pakistan' } }),
      'When a wicket falls in Pakistan’s matches'
    );
    assert.equal(describeAutomation({ trigger: 'FIFTY', scope: { kind: 'PLAYER', id: 'x', name: 'Babar Azam' } }), 'When Babar Azam reaches 50');
  });
});
