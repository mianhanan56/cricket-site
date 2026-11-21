import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addDays,
  dayKeyIn,
  describeSelection,
  isDayKey,
  pickDayParam,
  rangeSelection,
  selectionDays,
  toggleDay,
} from '../lib/fixtureDays';

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

  it('ignores days that are the right shape but not on the calendar', () => {
    for (const bad of ['2026-13-01', '2026-02-30', '2026-99-01..2026-99-05', '2026-10-01..2026-10-32', '2026-10-01,2026-00-04']) {
      assert.equal(pickDayParam(bad), '', bad);
    }
    assert.equal(isDayKey('2028-02-29'), true);
    assert.equal(isDayKey('2026-02-29'), false);
  });

  it('never throws on a bad selection or day', () => {
    assert.deepEqual(selectionDays('2026-99-01..2026-99-05'), []);
    assert.deepEqual(selectionDays('2026-10-01,2026-13-01'), ['2026-10-01']);
    assert.equal(addDays('2026-99-01', 1), '');
    assert.equal(describeSelection('2026-99-01..2026-99-05'), 'on the days picked');
  });

  it('steps across a month and a year end', () => {
    assert.equal(addDays('2026-12-31', 1), '2027-01-01');
    assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  });
});

describe('the day a fixture falls on', () => {
  it('depends on the zone named, not the host', () => {
    assert.equal(dayKeyIn('2026-11-20T20:00:00Z', 'UTC'), '2026-11-20');
    assert.equal(dayKeyIn('2026-11-20T20:00:00Z', 'Asia/Karachi'), '2026-11-21');
    assert.equal(dayKeyIn('2026-11-20T02:00:00Z', 'America/New_York'), '2026-11-19');
  });

  it('is empty for an unreadable instant, and falls back to UTC for an unknown zone', () => {
    assert.equal(dayKeyIn('not a date', 'UTC'), '');
    assert.equal(dayKeyIn('2026-11-20T20:00:00Z', 'Not/AZone'), '2026-11-20');
  });
});
