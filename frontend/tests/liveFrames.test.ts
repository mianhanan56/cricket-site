import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { acceptFrame, applyMatchesFrame, isLiveFrame, mergeFeedItems, type LiveFrame, type SeqBook } from '../lib/live/frames';

const frame = (type: string, seq: number, extra: Partial<LiveFrame> = {}): LiveFrame => ({
  type,
  topic: type.startsWith('matches') ? 'matches' : 'card:14D2',
  epoch: 'a',
  seq,
  ts: 0,
  ...extra,
});

describe('live frame ordering', () => {
  it('applies newer frames and drops older or repeated diffs', () => {
    const book: SeqBook = new Map();
    assert.equal(acceptFrame(book, frame('matches:snapshot', 101)), 'apply');
    assert.equal(acceptFrame(book, frame('matches:update', 102, { prev: 101 })), 'apply');
    assert.equal(acceptFrame(book, frame('matches:update', 103, { prev: 102 })), 'apply');
    assert.equal(acceptFrame(book, frame('matches:update', 101, { prev: 100 })), 'skip');
    assert.equal(acceptFrame(book, frame('matches:update', 103, { prev: 102 })), 'skip');
  });

  it('lets a whole body repeat its seq but not go backwards', () => {
    const book: SeqBook = new Map();
    assert.equal(acceptFrame(book, frame('card:update', 5)), 'apply');
    assert.equal(acceptFrame(book, frame('card:update', 5)), 'apply');
    assert.equal(acceptFrame(book, frame('card:update', 4)), 'skip');
  });

  it('follows seq numbers shared with other topics, and flags a missed diff', () => {
    const book: SeqBook = new Map();
    acceptFrame(book, frame('matches:snapshot', 1));
    // Seqs 2-6 went to other topics; the diff still follows directly on 1.
    assert.equal(acceptFrame(book, frame('matches:update', 7, { prev: 1 })), 'apply');
    assert.equal(acceptFrame(book, frame('matches:update', 12, { prev: 9 })), 'gap');
    assert.equal(acceptFrame(book, frame('matches:update', 14, { epoch: 'b', prev: 13 })), 'gap');
  });

  it('accepts a re-added topic whose snapshot keeps rising after a reconnect', () => {
    const book: SeqBook = new Map();
    acceptFrame(book, frame('matches:snapshot', 57));
    assert.equal(acceptFrame(book, frame('matches:snapshot', 80)), 'apply');
  });

  it('starts over when the hub restarts', () => {
    const book: SeqBook = new Map();
    acceptFrame(book, frame('matches:snapshot', 90));
    assert.equal(acceptFrame(book, frame('matches:snapshot', 1, { epoch: 'b' })), 'apply');
    assert.equal(acceptFrame(book, frame('matches:update', 2, { epoch: 'b', prev: 1 })), 'apply');
  });

  it('rejects anything that is not a frame', () => {
    assert.equal(isLiveFrame({ type: 'hello', v: 1 }), false);
    assert.equal(isLiveFrame({ type: 'matches:update', topic: 'matches', epoch: 'a', seq: Number.NaN }), false);
    assert.equal(isLiveFrame(frame('matches:update', 1)), true);
  });
});

describe('applying live frames', () => {
  it('replaces the list on a snapshot and patches it on a diff', () => {
    const start = applyMatchesFrame<number>(null, frame('matches:snapshot', 1, { data: { A: 1, B: 2 } }));
    assert.deepEqual(start, { A: 1, B: 2 });
    const next = applyMatchesFrame(start, frame('matches:update', 2, { changed: { B: 3, C: 4 }, removed: ['A'] }));
    assert.deepEqual(next, { B: 3, C: 4 });
    assert.deepEqual(start, { A: 1, B: 2 });
  });

  it('is idempotent: the same diff twice gives the same list', () => {
    const base = { A: 1 };
    const diff = frame('matches:update', 2, { changed: { A: 5 }, removed: [] });
    assert.deepEqual(applyMatchesFrame(applyMatchesFrame(base, diff), diff), { A: 5 });
  });

  it('ignores a diff with no list to apply it to', () => {
    assert.equal(applyMatchesFrame(null, frame('matches:update', 2, { changed: { A: 1 } })), null);
  });

  it('merges feed items by id, newest first, without duplicates', () => {
    const held = [{ id: '300', v: 'x' }, { id: '200', v: 'y' }];
    const merged = mergeFeedItems(held, [{ id: '400', v: 'z' }, { id: '300', v: 'x2' }], 10);
    assert.deepEqual(merged.map((m) => `${m.id}:${m.v}`), ['400:z', '300:x2', '200:y']);
    assert.equal(mergeFeedItems(merged, merged, 10).length, 3);
    assert.deepEqual(mergeFeedItems(merged, [], 2).map((m) => m.id), ['400', '300']);
  });
});
