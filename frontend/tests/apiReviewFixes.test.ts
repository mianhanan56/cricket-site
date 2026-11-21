import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import {
  attributeResult,
  decodeMatchNote,
  getApiFixtureSchedule,
  getApiMatch,
  getApiSeriesStatTable,
  toMatch,
} from '../lib/api';
import { pickNote } from '../lib/api/notes';
import { headToHead } from '../lib/headToHead';
import { oversOf } from '../lib/playerBalls';
import type { CommentaryBall, Match, Team } from '../types';

type Route = (url: string) => { status: number; body: unknown } | null;

function stubFetch(route: Route): void {
  mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    const hit = url.includes('/mapping') ? { status: 200, body: {} } : route(url) ?? { status: 404, body: {} };
    return new Response(JSON.stringify(hit.body), {
      status: hit.status,
      headers: { 'content-type': 'application/json' },
    });
  });
}

const team = (id: string, shortName: string, name = shortName): Team => ({ id, name, shortName, country: shortName });

const feedNames = (teams: Record<string, string>) =>
  ({
    t: new Map(Object.entries(teams).map(([k, sn]) => [k, { key: k, name: sn, shortName: sn }])),
    v: new Map(),
    s: new Map(),
    p: new Map(),
    u: new Map(),
  }) as Parameters<typeof toMatch>[2];

describe('series stat tables in The Hundred', () => {
  it('reads a 20-ball spell as four five-ball sets', async (t) => {
    t.after(() => mock.restoreAll());
    stubFetch((url) => {
      if (url.includes('/series/matches')) {
        return {
          status: 200,
          body: {
            '2026/8/1': [
              { matchKey: '^H1', id: 1, team1Key: 'P', team2Key: 'Q', venueKey: 'V', startTime: 1785542400000, status: 2, format: 5 },
            ],
          },
        };
      }
      if (url.includes('/match/scorecard')) {
        return { status: 200, body: [{ teamKey: 'P', total: '150/5(100', batting: [], bowling: ['BW1.30.20.0.2'] }] };
      }
      return null;
    });

    const table = await getApiSeriesStatTable('HS1', 'WICKETS');
    const bowling = table?.rows[0].bowling;
    assert.equal(bowling?.overs, 4);
    assert.equal(bowling?.economy, 7.5);
  });
});

describe('text statuses that are not stoppages', () => {
  const raw = {
    team1Key: 'P',
    team2Key: 'Q',
    seriesKey: 'S',
    venueKey: 'V',
    startTime: 1785542400000,
  };

  it('does not mark a toss or a session label as paused', () => {
    for (const statusText of ['Pakistan won the toss and chose to bat', 'Day 2 - Session 1']) {
      const note = decodeMatchNote({ ...raw, statusText });
      assert.equal(note?.paused, false, statusText);
    }
    assert.equal(decodeMatchNote({ ...raw, statusText: 'Rain delay' })?.paused, true);
  });

  it('lets a derived innings break beat a toss text', () => {
    const toss = decodeMatchNote({ ...raw, statusText: 'Pakistan won the toss and chose to bat' });
    const derived = { label: 'Innings Break', kind: 'BREAK' as const, detail: null, paused: true, betweenInnings: true };
    assert.equal(pickNote(toss, derived, { innings: [], format: 'T20' })?.label, 'Innings Break');
  });
});

describe('a finished match without result text', () => {
  const raw = {
    team1Key: 'P',
    team2Key: 'Q',
    seriesKey: 'S',
    venueKey: 'V',
    format: 'T20',
    startTime: 1785542400000,
    finishTime: 1785556800000,
  };

  it('shows the coded ending, never the code', () => {
    assert.equal(toMatch('M1', { ...raw, statusCode: '$x' }, feedNames({ P: 'PAK', Q: 'IND' })).result, 'No Result');
    assert.equal(toMatch('M1', { ...raw, statusCode: '&aZ9' }, feedNames({ P: 'PAK', Q: 'IND' })).result, null);
  });
});

describe('archived match lookups', () => {
  it('is null for a match the upstream refuses, and throws on an outage', async (t) => {
    t.after(() => mock.restoreAll());
    let infoStatus = 404;
    stubFetch((url) => {
      if (url.includes('/matches/live')) return { status: 200, body: {} };
      if (url.includes('/match/info')) return { status: infoStatus, body: {} };
      return null;
    });

    assert.equal(await getApiMatch('ZZ1'), null);
    infoStatus = 503;
    await assert.rejects(getApiMatch('ZZ2'));
  });
});

describe('super over results', () => {
  const ind = team('I', 'IND', 'India');
  const aus = team('A', 'AUS', 'Australia');
  const result = 'Match tied (IND won the Super Over)';

  it('attributes the super over winner', () => {
    assert.deepEqual(attributeResult(result, ind, aus), { winnerKey: 'I', method: null });
  });

  it('counts it as a win in a head-to-head, not a draw', () => {
    const match = {
      id: 'M1',
      homeTeam: ind,
      awayTeam: aus,
      series: { id: 'S', name: 'Series' },
      format: 'T20',
      status: 'COMPLETED',
      venue: 'V',
      startTime: '2026-08-01T00:00:00.000Z',
      result,
    } as Match;
    const record = headToHead(ind, aus, [match]);
    assert.equal(record?.homeWins, 1);
    assert.equal(record?.drawn, 0);
  });
});

describe('fixture schedule outages', () => {
  it('throws when every page of the first batch fails', async (t) => {
    t.after(() => mock.restoreAll());
    stubFetch((url) => (url.includes('/fixtures') ? { status: 503, body: {} } : null));
    await assert.rejects(getApiFixtureSchedule());
  });

  it('still returns what it read when only some pages fail', async (t) => {
    t.after(() => mock.restoreAll());
    stubFetch((url) => {
      if (!url.includes('/fixtures')) return null;
      return url.includes('page=0') ? { status: 200, body: [] } : { status: 503, body: {} };
    });
    const schedule = await getApiFixtureSchedule();
    assert.deepEqual(schedule.fixtures, []);
  });
});

describe('a bowler’s over', () => {
  const ball = (id: number, text: string, isWicket = true): CommentaryBall => ({
    id: String(id),
    over: 5,
    ball: id,
    runs: 0,
    batRuns: 0,
    extraRuns: 0,
    extra: null,
    isWicket,
    text,
    inning: 0,
    bowlerId: 'B',
    batterId: 'X',
  });

  it('does not credit a run out to the bowler', () => {
    const balls = [ball(1, 'OUT! Run out! Direct hit from cover'), ball(2, 'OUT! Caught at long on')];
    assert.equal(oversOf(balls, 'bowler')[0].wickets, 1);
  });
});
