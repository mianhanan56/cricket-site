// The match-state rules, pinned.
//
// This suite exists because one bug kept coming back in different clothes: a
// match that had stopped playing being shown as LIVE, or a match being played
// being shown as stopped. Every case below is a real payload seen in the crex
// feed, kept as a fixture, so a future change to the rules has to say out loud
// which of these it is willing to break.
//
// The rule the suite enforces, and the reason the cases read the way they do:
// crex's own report of the match state wins unless something *observed*
// contradicts it — a delivery bowled seconds ago, a score that moved, or a card
// that cannot be true alongside the label. Never a convention about how cricket
// is usually run. Conventions are what produced the recurring bug: "a day's play
// closes at the end of an over" is true of a day that runs its course and false
// of one called off for bad light.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  clearResumedStoppages,
  decodeMatchNote,
  isStaleStoppage,
  toMatchStatus,
  type CrexRawMatch,
  type StoppageWatch,
} from '../lib/crex';
import type { InningsScore, Match, MatchNote, Team } from '../types';

// --- fixtures ---------------------------------------------------------------

const team = (id: string, shortName: string): Team => ({
  id,
  name: shortName,
  shortName,
  country: shortName,
});

const innings = (
  shortName: string,
  runs: number,
  wickets: number,
  overs: number,
  extra: Partial<InningsScore> = {}
): InningsScore => ({
  teamId: shortName,
  teamShortName: shortName,
  runs,
  wickets,
  overs,
  ...extra,
});

const stumps: MatchNote = { label: 'Stumps', kind: 'STUMPS', paused: true };
const lunch: MatchNote = { label: 'Lunch Break', kind: 'BREAK', paused: true };
const inningsBreak: MatchNote = {
  label: 'Innings Break',
  kind: 'BREAK',
  paused: true,
  betweenInnings: true,
};
const rain: MatchNote = { label: 'Rain Delay', kind: 'DELAY', paused: true };
const tossDelayed: MatchNote = {
  label: 'Toss Delayed',
  kind: 'DELAY',
  paused: true,
  preToss: true,
};

const TEST_CHECK = { format: 'TEST' as const, perOver: 6 };
const T20_CHECK = { format: 'T20' as const, perOver: 6 };

// --- the recurring bug ------------------------------------------------------

describe('stumps', () => {
  // IND v SL, Colombo, day 3: SL 265/8 in 83.4 overs, the day ended early with
  // rain about. crex sent a:"$l", res:"Stumps"; the old over-boundary rule read
  // the part-bowled over as proof of play and the card said LIVE.
  it('is kept when the day ended mid-over', () => {
    const check = {
      ...TEST_CHECK,
      innings: [innings('IND', 503, 9, 138), innings('SL', 265, 8, 83.4, { phase: 'CURRENT' })],
    };

    assert.equal(isStaleStoppage(stumps, check), false);
  });

  it('is kept when the day ended on a completed over', () => {
    const check = {
      ...TEST_CHECK,
      innings: [innings('IND', 503, 9, 138), innings('SL', 265, 8, 84, { phase: 'CURRENT' })],
    };

    assert.equal(isStaleStoppage(stumps, check), false);
  });

  // The signal that does contradict it: someone is bowling.
  it('is dropped when a delivery landed seconds ago', () => {
    const now = Date.parse('2026-08-25T10:00:00.000Z');
    const check = {
      ...TEST_CHECK,
      innings: [innings('IND', 503, 9, 138), innings('SL', 265, 8, 83.4, { phase: 'CURRENT' })],
      lastBallAt: new Date(now - 20_000).toISOString(),
      now,
    };

    assert.equal(isStaleStoppage(stumps, check), true);
  });

  it('survives a delivery from before the interval', () => {
    const now = Date.parse('2026-08-25T10:00:00.000Z');
    const check = {
      ...TEST_CHECK,
      innings: [innings('IND', 503, 9, 138), innings('SL', 265, 8, 83.4, { phase: 'CURRENT' })],
      // Ten minutes: the players are off, whatever the last ball was.
      lastBallAt: new Date(now - 600_000).toISOString(),
      now,
    };

    assert.equal(isStaleStoppage(stumps, check), false);
  });
});

describe('intervals inside an innings', () => {
  // Lunch taken early for rain, called mid-over. The same false convention that
  // broke stumps would call this a latch too.
  it('are kept when called mid-over', () => {
    const check = { ...TEST_CHECK, innings: [innings('SL', 120, 3, 41.2, { phase: 'CURRENT' })] };

    assert.equal(isStaleStoppage(lunch, check), false);
  });

  it('are dropped when a delivery landed seconds ago', () => {
    const now = Date.parse('2026-08-25T10:00:00.000Z');
    const check = {
      ...TEST_CHECK,
      innings: [innings('SL', 120, 3, 41.2, { phase: 'CURRENT' })],
      lastBallAt: new Date(now - 30_000).toISOString(),
      now,
    };

    assert.equal(isStaleStoppage(lunch, check), true);
  });
});

describe('an innings break', () => {
  // ACA v BAN-HP: crex still reported "Innings Break" with the chase 13.4 overs
  // deep. That is not a convention argument — no innings has just ended — so the
  // note goes, with no ball feed needed.
  it('is dropped when the innings under it is in progress', () => {
    const check = {
      ...T20_CHECK,
      innings: [innings('ACA', 164, 9, 20), innings('BAN', 93, 4, 13.4, { phase: 'CURRENT' })],
    };

    assert.equal(isStaleStoppage(inningsBreak, check), true);
  });

  it('is kept between the two innings', () => {
    const check = { ...T20_CHECK, innings: [innings('ACA', 164, 9, 20, { phase: 'CURRENT' })] };

    assert.equal(isStaleStoppage(inningsBreak, check), false);
  });

  // All out on the third ball is a real innings break at 17.3 overs.
  it('is kept when the innings ended mid-over', () => {
    const check = { ...T20_CHECK, innings: [innings('GOR', 112, 10, 17.3, { phase: 'CURRENT' })] };

    assert.equal(isStaleStoppage(inningsBreak, check), false);
  });

  it('is kept before a ball is bowled', () => {
    const check = {
      ...T20_CHECK,
      innings: [innings('ACA', 164, 9, 20), innings('BAN', 0, 0, 0, { phase: 'CURRENT' })],
    };

    assert.equal(isStaleStoppage(inningsBreak, check), false);
  });

  // An 11-over-a-side game: the chase is complete at 11 overs, not at the
  // format's 20, so there is nothing left for the note to contradict. Read off
  // the first innings, the same way the required rate is.
  it('is kept over a completed chase in a shortened match', () => {
    const check = {
      ...T20_CHECK,
      innings: [innings('THA-W', 91, 4, 11), innings('PAK-W', 95, 3, 11, { phase: 'CURRENT' })],
    };

    assert.equal(isStaleStoppage(inningsBreak, check), false);
  });
});

describe('weather', () => {
  // Rain and bad light stop play wherever the over stands and are never judged:
  // nothing in a scorecard says whether it has stopped raining.
  it('is never called a latch', () => {
    const now = Date.parse('2026-08-25T10:00:00.000Z');
    const check = {
      ...TEST_CHECK,
      innings: [innings('SL', 120, 3, 41.2, { phase: 'CURRENT' })],
      lastBallAt: new Date(now - 20_000).toISOString(),
      now,
    };

    assert.equal(isStaleStoppage(rain, check), false);
  });
});

describe('a toss crex still calls delayed', () => {
  // THA-W v PAK-W, Women's Asian Games T20 2026: crex sent "Toss Delayed" with
  // the chase 4.3 overs deep, and it stood all match. The match page lost the
  // last ball, the striker mark and the whole bowling panel with it, because all
  // three hang off there being no stoppage.
  it('is dropped once a ball has been bowled', () => {
    const check = {
      ...T20_CHECK,
      innings: [innings('THA-W', 91, 4, 11), innings('PAK-W', 37, 2, 4.3, { phase: 'CURRENT' })],
    };

    assert.equal(isStaleStoppage(tossDelayed, check), true);
  });

  // The toss is a one-time gate, so unlike an interval this needs no ball feed
  // and no timing window — the first innings alone settles it.
  it('is dropped in a first innings, with no ball feed to ask', () => {
    const check = { ...T20_CHECK, innings: [innings('THA-W', 12, 0, 2.1, { phase: 'CURRENT' })] };

    assert.equal(isStaleStoppage(tossDelayed, check), true);
  });

  it('is kept while no cricket has been played', () => {
    assert.equal(isStaleStoppage(tossDelayed, { ...T20_CHECK, innings: [] }), false);
  });

  it('is kept over an innings opened but not started', () => {
    const check = { ...T20_CHECK, innings: [innings('THA-W', 0, 0, 0, { phase: 'CURRENT' })] };

    assert.equal(isStaleStoppage(tossDelayed, check), false);
  });
});

// --- the list's own clock ---------------------------------------------------

describe('a stoppage the score plays through', () => {
  const match = (overs: number, note: MatchNote | null): Match => ({
    id: 'M1',
    homeTeam: team('A', 'AAA'),
    awayTeam: team('B', 'BBB'),
    series: { id: 'S', name: 'Series' },
    format: 'T20',
    status: 'LIVE',
    venue: 'Ground',
    startTime: '2026-08-25T09:00:00.000Z',
    note,
    scorecard: { innings: [innings('AAA', 90, 3, overs, { phase: 'CURRENT' })] },
  });

  it('is dropped once the same note stands over a moving score', () => {
    const watch = new Map<string, StoppageWatch>();
    let now = 1_000_000;

    // First sight of the break: nothing contradicts it yet, so it stands.
    let out = clearResumedStoppages([match(12, lunch)], watch, now);
    assert.equal(out[0].note?.kind, 'BREAK');

    // Next poll, same label, score has moved — somebody is bowling.
    now += 2_000;
    out = clearResumedStoppages([match(12.4, lunch)], watch, now);
    assert.equal(out[0].note, null);
  });

  it('is kept while the score sits still', () => {
    const watch = new Map<string, StoppageWatch>();
    let now = 1_000_000;

    let out = clearResumedStoppages([match(12, stumps)], watch, now);
    assert.equal(out[0].note?.kind, 'STUMPS');

    for (let i = 0; i < 5; i++) {
      now += 2_000;
      out = clearResumedStoppages([match(12, stumps)], watch, now);
      assert.equal(out[0].note?.kind, 'STUMPS', 'stumps must survive a static score');
    }
  });

  it('comes back when the score settles again', () => {
    const watch = new Map<string, StoppageWatch>();
    let now = 1_000_000;

    clearResumedStoppages([match(12, lunch)], watch, now);
    now += 2_000;
    assert.equal(clearResumedStoppages([match(12.4, lunch)], watch, now)[0].note, null);

    // Well past the resumption window with no further movement: the players are
    // off, whatever moved earlier.
    now += 200_000;
    assert.equal(
      clearResumedStoppages([match(12.4, lunch)], watch, now)[0].note?.kind,
      'BREAK'
    );
  });
});

// --- what crex sent, decoded ------------------------------------------------

describe('the raw feed', () => {
  // The exact fields the two Tests at stumps carried.
  const atStumps: CrexRawMatch = {
    a: '$l',
    b: 'W',
    c: 'Q',
    q: '^2BG',
    v: 'GY',
    ti: 1787459400000,
    res: 'Stumps',
    n: 30,
    j: '!503/9(138.0',
    k: '265/8(83.4',
    fo: 'Test',
  };

  it('decodes "$l" as stumps, paused, and not between innings', () => {
    const note = decodeMatchNote(atStumps, { first: 'IND', second: 'SL' });

    assert.equal(note?.kind, 'STUMPS');
    assert.equal(note?.paused, true);
    assert.notEqual(note?.betweenInnings, true);
  });

  it('keeps a Test at stumps live rather than finished', () => {
    // Both facts at once, and the reason they are separate fields: the match is
    // in progress, and nobody is batting.
    assert.equal(toMatchStatus(atStumps), 'LIVE');
  });

  it('decodes "$a" as an innings break, flagged as between innings', () => {
    const note = decodeMatchNote({ ...atStumps, a: '$a' }, { first: 'IND', second: 'SL' });

    assert.equal(note?.kind, 'BREAK');
    assert.equal(note?.betweenInnings, true);
  });

  it('flags "$s" as a toss that has not been made', () => {
    const note = decodeMatchNote({ ...atStumps, a: '$s' }, { first: 'IND', second: 'SL' });

    assert.equal(note?.kind, 'DELAY');
    assert.equal(note?.preToss, true);
  });

  // crex sends this one as prose as often as as a code — the wording in the feed
  // that started all this was "Toss Delayed", with no "$s" beside it.
  it('flags the same status sent as text', () => {
    const note = decodeMatchNote(
      { ...atStumps, a: '', res: 'Toss Delayed' },
      { first: 'IND', second: 'SL' }
    );

    assert.equal(note?.label, 'Toss Delayed');
    assert.equal(note?.preToss, true);
  });

  // The toss having happened is the opposite claim, and contradicts nothing.
  it('does not flag the toss result', () => {
    const note = decodeMatchNote({ ...atStumps, a: '^1' }, { first: 'IND', second: 'SL' });

    assert.equal(note?.kind, 'TOSS');
    assert.notEqual(note?.preToss, true);
  });
});
