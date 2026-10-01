import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { MatchEvent } from '../types';
import { breakFromFeed } from '../lib/feedBreak';

const note = (text: string, at: string): MatchEvent => ({ id: at, kind: 'NOTE', label: 'Update', text, timestamp: at });
const lastBall = '2026-09-30T14:12:00.000Z';

describe('break from the commentary', () => {
  it('reads a drinks announcement posted after the last ball', () => {
    const out = breakFromFeed([note('7:44 PM IST & Local Time: Drinks Break! India have laid the perfect platform', '2026-09-30T14:14:00.000Z')], lastBall);
    assert.deepEqual(out, { label: 'Drinks Break', kind: 'BREAK', paused: true });
  });

  it('ignores the announcement once a ball has been bowled after it', () => {
    assert.equal(breakFromFeed([note('Drinks Break!', '2026-09-30T14:10:00.000Z')], lastBall), null);
  });

  it('does not read a stats note as an interval', () => {
    const stats = note('Most 50+ Scores vs West Indies in ODIs: 21 - Virat Kohli, a team record before tea', '2026-09-30T14:14:00.000Z');
    assert.equal(breakFromFeed([stats], lastBall), null);
  });

  it('reads lunch and tea in a Test', () => {
    assert.equal(breakFromFeed([note("That's Lunch on Day 2.", '2026-09-30T14:14:00.000Z')], lastBall)?.label, 'Lunch Break');
    assert.equal(breakFromFeed([note('Tea Break! Australia 212/4', '2026-09-30T14:14:00.000Z')], lastBall)?.label, 'Tea Break');
  });
});
