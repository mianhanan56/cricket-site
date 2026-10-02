import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Match, MatchStatus, Team } from '../types';
import { describeAutomation, parseAutomations, sameScope, summarizeTriggers, triggersForScope } from '../lib/automations';
import { activeSeries, activeTeams } from '../lib/alertSuggestions';

const team = (id: string): Team => ({ id, name: id, shortName: id, country: id });

function match(id: string, status: MatchStatus, home: string, away: string, series: string, startTime: string): Match {
  return {
    id,
    homeTeam: team(home),
    awayTeam: team(away),
    series: { id: series, name: `Series ${series}` },
    format: 'T20',
    status,
    venue: 'Somewhere',
    startTime,
    ballsPerOver: 6,
  };
}

describe('alerts with several moments', () => {
  it('reads an alert saved with a single trigger as a one-moment alert', () => {
    const [a] = parseAutomations([
      { id: 'a1', trigger: 'WICKET', scope: { kind: 'ANY' }, action: { inApp: true, system: false }, enabled: true, createdAt: 1, fired: 0, lastFiredAt: null },
    ])!;
    assert.deepEqual(a.triggers, ['WICKET']);
    assert.equal('trigger' in a, false);
  });

  it('keeps known moments once each and drops an alert with none', () => {
    const parsed = parseAutomations([
      { id: 'a1', triggers: ['SIX', 'SIX', 'NOPE', 'FOUR'], scope: { kind: 'ANY' } },
      { id: 'a2', triggers: ['NOPE'], scope: { kind: 'ANY' } },
    ])!;
    assert.deepEqual(parsed.map((a) => [a.id, a.triggers]), [['a1', ['SIX', 'FOUR']]]);
  });

  it('drops an alert whose scope is unreadable and fills missing fields', () => {
    const parsed = parseAutomations([
      { id: 'a1', triggers: ['WICKET'] },
      { id: 'a2', triggers: ['WICKET'], scope: { kind: 'MOON' } },
      { id: 'a3', triggers: ['WICKET'], scope: { kind: 'TEAM', id: 'IND', name: 'India' }, fired: 'x' },
    ])!;
    assert.equal(parsed.length, 1);
    assert.deepEqual(parsed[0], {
      id: 'a3',
      triggers: ['WICKET'],
      scope: { kind: 'TEAM', id: 'IND', name: 'India' },
      action: { inApp: true, system: false },
      enabled: true,
      createdAt: 0,
      fired: 0,
      lastFiredAt: null,
    });
  });

  it('reads back a saved alert unchanged', () => {
    const saved = {
      id: 'a1',
      triggers: ['SIX', 'FIFTY'],
      scope: { kind: 'SERIES', id: '1JK', name: 'Asia Cup' },
      action: { inApp: false, system: true },
      enabled: false,
      createdAt: 1_700_000_000_000,
      fired: 4,
      lastFiredAt: 1_700_000_500_000,
    };
    assert.deepEqual(parseAutomations([saved]), [saved]);
  });

  it('describes several moments in one sentence', () => {
    assert.equal(
      describeAutomation({ triggers: ['WICKET', 'SIX', 'RESULT'], scope: { kind: 'TEAM', id: 'IND', name: 'India' } }),
      'When a wicket falls, a six is hit or a match finishes in India’s matches'
    );
    assert.equal(describeAutomation({ triggers: ['FIFTY', 'HUNDRED'], scope: { kind: 'PLAYER', name: 'Babar Azam' } }), 'When Babar Azam reaches 50 or 100');
  });

  it('summarises a card title, and names everything as all match events', () => {
    const scope = { kind: 'TEAM' as const, id: 'IND', name: 'India' };
    assert.equal(summarizeTriggers({ triggers: ['FIFTY', 'WICKET', 'HUNDRED'], scope }), 'Wicket + Fifty + Century');
    assert.equal(summarizeTriggers({ triggers: ['WICKET', 'SIX', 'FOUR', 'RESULT'], scope }), 'Wicket + Six + 2 more');
    assert.equal(summarizeTriggers({ triggers: triggersForScope('TEAM'), scope }), 'All match events');
    assert.equal(summarizeTriggers({ triggers: ['FIFTY', 'HUNDRED'], scope: { kind: 'PLAYER', name: 'X' } }), 'Fifty + Century');
  });

  it('compares scopes by kind and entity', () => {
    assert.ok(sameScope({ kind: 'ANY' }, { kind: 'ANY' }));
    assert.ok(sameScope({ kind: 'TEAM', id: 'IND', name: 'India' }, { kind: 'TEAM', id: 'IND' }));
    assert.ok(!sameScope({ kind: 'TEAM', id: 'IND' }, { kind: 'TEAM', id: 'AUS' }));
  });
});

describe('team and series suggestions', () => {
  const matches = [
    match('m1', 'COMPLETED', 'NZ', 'SA', 'S1', '2026-09-20T10:00:00Z'),
    match('m2', 'UPCOMING', 'ENG', 'AUS', 'S2', '2026-10-05T10:00:00Z'),
    match('m3', 'UPCOMING', 'NZ', 'SA', 'S1', '2026-10-01T10:00:00Z'),
    match('m4', 'LIVE', 'IND', 'PAK', 'S3', '2026-09-30T10:00:00Z'),
    match('m5', 'COMPLETED', 'WI', 'SL', 'S4', '2026-09-25T10:00:00Z'),
    match('m6', 'UPCOMING', 'TBA', 'TBC', 'S5', '2026-10-02T10:00:00Z'),
  ];

  it('orders teams by playing now, then next to play, and skips placeholders', () => {
    assert.deepEqual(activeTeams(matches, 10).map((t) => t.id), ['IND', 'PAK', 'NZ', 'SA', 'ENG', 'AUS']);
    assert.deepEqual(activeTeams(matches, 3).map((t) => t.id), ['IND', 'PAK', 'NZ']);
  });

  it('orders series by on now, running, upcoming, then recently finished', () => {
    assert.deepEqual(activeSeries(matches, 10).map((s) => s.id), ['S3', 'S1', 'S5', 'S2', 'S4']);
  });
});
