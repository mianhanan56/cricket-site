import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hasEntryBehind, pushEntry, startTrack, traverseEntry } from '../lib/navigationDepth';

describe('in-app history track', () => {
  it('has nothing behind a cold landing', () => {
    assert.equal(hasEntryBehind(startTrack('/matches/1')), false);
  });

  it('back to the landing entry leaves nothing of ours behind it', () => {
    let t = startTrack('/matches/1');
    t = pushEntry(t, '/series/5');
    assert.equal(hasEntryBehind(t), true);
    t = traverseEntry(t, '/matches/1');
    assert.equal(hasEntryBehind(t), false);
    assert.equal(t.index, 0);
  });

  it('forward after back restores the entry behind', () => {
    let t = pushEntry(pushEntry(startTrack('/a'), '/b'), '/c');
    t = traverseEntry(traverseEntry(t, '/b'), '/a');
    assert.equal(t.index, 0);
    t = traverseEntry(t, '/b');
    assert.equal(t.index, 1);
    t = traverseEntry(t, '/c');
    assert.equal(t.index, 2);
    assert.equal(hasEntryBehind(t), true);
  });

  it('a push after going back drops the forward entries', () => {
    let t = pushEntry(pushEntry(startTrack('/a'), '/b'), '/c');
    t = traverseEntry(t, '/b');
    t = pushEntry(t, '/d');
    assert.deepEqual(t.entries, ['/a', '/b', '/d']);
    assert.equal(t.index, 2);
    assert.deepEqual(traverseEntry(t, '/c'), startTrack('/c'));
  });

  it('ignores a same-path push and a query-only traversal', () => {
    const t = pushEntry(startTrack('/a'), '/b');
    assert.equal(pushEntry(t, '/b'), t);
    assert.equal(traverseEntry(t, '/b'), t);
  });

  it('prefers back when both neighbours share the path', () => {
    let t = pushEntry(pushEntry(startTrack('/a'), '/b'), '/a');
    t = traverseEntry(t, '/b');
    assert.equal(traverseEntry(t, '/a').index, 0);
  });

  it('starts over on an entry it never saw', () => {
    const t = traverseEntry(pushEntry(startTrack('/a'), '/b'), '/elsewhere');
    assert.deepEqual(t, startTrack('/elsewhere'));
    assert.equal(hasEntryBehind(t), false);
  });
});
