import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { FeedNote } from '../types';
import { toBallEntry, type BallEntry } from '../lib/balls';
import { feedFromRows } from '../lib/api';
import { PRE_BLOCK, ballKey, blockItems, blockSignature, checkRewrites, groupBlocks, itemKey, plainLine, splitBall, textToRich } from '../lib/commentaryRewrite';

const T0 = Date.UTC(2026, 10, 19, 8);
const ball = (over: number, n: number, runs: number, extra: BallEntry['extra'] = null, isWicket = false): BallEntry => ({
  id: String(T0 + (over * 6 + n) * 40_000),
  over,
  ball: n,
  runs,
  batRuns: extra ? 0 : runs,
  extraRuns: extra ? runs : 0,
  extra,
  isWicket,
  text: `Aamir Jamal to Sonal Dinusha — ball ${over}.${n} described`,
  headline: 'Aamir Jamal to Sonal Dinusha',
  scoreAfter: null,
  inning: 2,
  timestamp: new Date(T0 + (over * 6 + n) * 40_000).toISOString(),
});
const note = (at: number, text: string, featured = false): FeedNote => ({
  id: String(at),
  inning: 2,
  at,
  kind: 'text',
  featured,
  paragraphs: [[[{ text }]]],
});

describe('commentary rewrite blocks', () => {
  it('groups balls by five overs and notes after the ball before them', () => {
    const balls = [ball(4, 6, 0), ball(5, 1, 1), ball(9, 6, 4), ball(10, 1, 0)];
    const after = Date.parse(balls[1].timestamp!) + 1000;
    const blocks = groupBlocks(balls, [note(after, 'Drinks'), note(after, 'Records', true)]);
    assert.deepEqual([...blocks.keys()].sort(), ['2:0', '2:1', '2:2']);
    assert.equal(blocks.get('2:1')!.balls.length, 2);
    assert.deepEqual(blocks.get('2:1')!.notes.map((n) => n.id), [String(after)]);
  });

  it('keeps notes from before the first ball in their own block', () => {
    const balls = [ball(0, 1, 0)];
    const blocks = groupBlocks(balls, [note(T0 - 60_000, 'Pitch report')]);
    assert.deepEqual(blocks.get(`2:${PRE_BLOCK}`)!.notes.map((n) => n.id), [String(T0 - 60_000)]);
    assert.deepEqual(groupBlocks([], [note(T0, 'Team news')]).get(`2:${PRE_BLOCK}`)!.notes.length, 1);
  });

  it('gives the page and the route the same key for a ball from the feed', () => {
    const { balls } = feedFromRows([
      { type: 'b', id: T0, inning: 2, over: '92.4', outcome: '0', headline: 'Abbas to Rathnayake', text: 'Good length, <b>nips back</b> in.' },
    ]);
    const [item] = blockItems({ inning: 2, block: 18, balls, notes: [] });
    assert.equal(item.players, 'Abbas to Rathnayake');
    assert.equal(ballKey(toBallEntry(balls[0])), itemKey(item));
  });

  it('keys an item by its wording, so a corrected ball is asked again', () => {
    const b = ball(5, 1, 1);
    const [item] = blockItems({ inning: 2, block: 1, balls: [b], notes: [] });
    assert.equal(ballKey(b), itemKey(item));
    const fixed = { ...b, text: 'Aamir Jamal to Sonal Dinusha — driven for four' };
    assert.notEqual(ballKey(fixed), ballKey(b));
    assert.notEqual(blockSignature(blockItems({ inning: 2, block: 1, balls: [fixed], notes: [] })), blockSignature([item]));
  });

  it('sends the description, not the names, and only prose', () => {
    const b = ball(5, 1, 1);
    const items = blockItems({ inning: 2, block: 1, balls: [b], notes: [note(1, 'Drinks are on')] as never });
    assert.deepEqual(items[0], { id: b.id, kind: 'ball', over: '5.1', players: 'Aamir Jamal to Sonal Dinusha', result: '1 run.', source: 'ball 5.1 described' });
    assert.deepEqual(items[1], { id: 'n1', kind: 'note', source: 'Drinks are on' });
  });

  it('splits a ball line on its headline, never on a dash in the prose', () => {
    assert.deepEqual(splitBall({ text: 'A to B — full — and driven', headline: 'A to B' }), { head: 'A to B', body: 'full — and driven' });
    assert.deepEqual(splitBall({ text: 'Full and wide — driven for four' }), { head: '', body: 'Full and wide — driven for four' });
    assert.deepEqual(splitBall({ text: 'A to B', headline: 'A to B' }), { head: 'A to B', body: '' });
  });
});

describe('plain line before a rewrite', () => {
  it('reads the outcome from data', () => {
    assert.equal(plainLine(ball(1, 1, 0)), 'No run.');
    assert.equal(plainLine(ball(1, 1, 2)), '2 runs.');
    assert.equal(plainLine(ball(1, 1, 4)), 'Four.');
    assert.equal(plainLine(ball(1, 1, 1, 'noball')), 'No ball, 1 run.');
    assert.equal(plainLine(ball(1, 1, 1, 'legbye')), 'Leg bye, 1 run.');
    assert.equal(plainLine(ball(1, 1, 0, null, true)), 'Out.');
  });
});

describe('checking the model', () => {
  const items = blockItems({ inning: 2, block: 1, balls: [ball(5, 1, 1), ball(5, 2, 0)], notes: [] });

  it('keeps answers to asked ids, cleans markdown, drops copies and strangers', () => {
    const got = checkRewrites(
      {
        items: [
          { id: items[0].id, text: '**Short** and turned  away for one.' },
          { id: items[1].id, text: 'ball 5.2 described' },
          { id: 'nope', text: 'invented' },
        ],
      },
      items
    );
    assert.deepEqual([...got], [[items[0].id, 'Short and turned away for one.']]);
  });

  it('leaves out an id the model skipped, refuses links, keeps "#1"', () => {
    const got = checkRewrites(
      {
        items: [
          { id: items[0].id, text: 'Now the #1 bowler, he finds the edge.' },
          { id: items[1].id, text: 'Great ball. Follow us at www.example.com' },
        ],
      },
      items
    );
    assert.deepEqual([...got], [[items[0].id, 'Now the #1 bowler, he finds the edge.']]);
    assert.equal(checkRewrites({ items: [{ id: items[0].id, text: 'More at https://x.example now' }] }, items).size, 0);
    assert.equal(checkRewrites({ items: [{ id: items[0].id, text: 'Read it on scores.com today' }] }, items).size, 0);
    for (const text of ['Visit WWW.SCAM.COM', 'See Example.com', 'Tap bit.ly/x9 now'])
      assert.equal(checkRewrites({ items: [{ id: items[0].id, text }] }, items).size, 0, text);
  });

  it('keeps prose a loose filter would take for a link, and drops the @ of a handle', () => {
    const got = checkRewrites(
      {
        items: [
          { id: items[0].id, text: 'Gone for four.In comes the spinner, wk.in position for St.Kitts/Nevis Patriots.' },
          { id: items[1].id, text: 'As @ICC put it, a stunning grab.' },
        ],
      },
      items
    );
    assert.deepEqual([...got.values()], ['Gone for four.In comes the spinner, wk.in position for St.Kitts/Nevis Patriots.', 'As ICC put it, a stunning grab.']);
  });

  it('survives a malformed answer', () => {
    assert.equal(checkRewrites(null, items).size, 0);
    assert.equal(checkRewrites({ items: 'x' }, items).size, 0);
  });

  it('turns a rewritten note back into paragraphs', () => {
    assert.deepEqual(textToRich('One.\nTwo.\n\nThree.'), [[[{ text: 'One.' }], [{ text: 'Two.' }]], [[{ text: 'Three.' }]]]);
  });
});
