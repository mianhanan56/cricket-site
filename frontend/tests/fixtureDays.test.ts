import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pickDayParam, rangeSelection, selectionDays, toggleDay } from '../lib/fixtureDays';

describe('picking fixture days', () => {
  it('reads one day, a range and a list from ?date=', () => {
    assert.equal(pickDayParam('2026-10-11'), '2026-10-11');
    assert.equal(pickDayParam('2026-10-11..2026-10-01'), '2026-10-01..2026-10-11');
    assert.equal(pickDayParam('2026-10-04,2026-10-02,2026-10-04'), '2026-10-02,2026-10-04');
  });

  it('ignores anything malformed', () => {
    for (const bad of ['', 'today', '2026-10-01..', '2026-10-01..2026-10-05..2026-10-09', '2026-10-01,oct-2']) {
      assert.equal(pickDayParam(bad), '');
    }
  });

  it('expands a range to every day in it, across a month end', () => {
    assert.deepEqual(selectionDays('2026-09-29..2026-10-02'), ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
    assert.equal(selectionDays('2026-01-01..2026-12-31').length, 62);
  });

  it('makes a range in either order, and one day from the same day twice', () => {
    assert.equal(rangeSelection('2026-10-11', '2026-10-01'), '2026-10-01..2026-10-11');
    assert.equal(rangeSelection('2026-10-05', '2026-10-05'), '2026-10-05');
  });

  it('toggles single days in and out, including out of a range', () => {
    assert.equal(toggleDay('', '2026-10-04'), '2026-10-04');
    assert.equal(toggleDay('2026-10-04', '2026-10-01'), '2026-10-01,2026-10-04');
    assert.equal(toggleDay('2026-10-01,2026-10-04', '2026-10-04'), '2026-10-01');
    assert.equal(toggleDay('2026-10-01..2026-10-03', '2026-10-02'), '2026-10-01,2026-10-03');
    assert.equal(toggleDay('2026-10-01', '2026-10-01'), '');
  });
});
