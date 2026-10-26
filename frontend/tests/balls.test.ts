import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { InningsScore } from '../types';
import { dedupeDeliveries, lastIndexAtOrBelow, reachedByCard, type BallEntry } from '../lib/balls';

const inn = (overs: number, notStarted = false): InningsScore =>
  ({ teamShortName: 'A', runs: 100, wickets: 2, overs, notStarted }) as InningsScore;
const ball = (inning: number, over: number, n: number, extra?: BallEntry['extra']) =>
  ({ inning, over, ball: n, extra }) as BallEntry;
const at = (balls: BallEntry[]) => balls.map((b) => `${b.inning}:${b.over}.${b.ball}${b.extra ? b.extra : ''}`);

describe('balls the scorecard has reached', () => {
  it('holds back deliveries past the card', () => {
    const balls = [ball(1, 45, 4), ball(1, 45, 5), ball(1, 45, 6)];
    assert.deepEqual(at(reachedByCard(balls, [inn(50), inn(45.5)], 6)), ['1:45.4', '1:45.5']);
    assert.equal(reachedByCard(balls, [inn(50), inn(46)], 6).length, 3);
  });

  it('keeps a wide bowled after the ball the card is on', () => {
    const balls = [ball(0, 0, 2), ball(0, 0, 3, 'wide')];
    assert.equal(reachedByCard(balls, [inn(0.2)], 6).length, 2);
  });

  it('holds back a new innings the card has not opened', () => {
    const balls = [ball(0, 19, 6), ball(1, 0, 1)];
    assert.deepEqual(at(reachedByCard(balls, [inn(20), inn(0, true)], 6)), ['0:19.6']);
  });

  it('passes everything through without a card', () => {
    const balls = [ball(0, 3, 1)];
    assert.equal(reachedByCard(balls, [], 6).length, 1);
  });
});

describe('one entry per delivery', () => {
  const d = (id: string, over: number, n: number, extra: BallEntry['extra'] = null, scoreAfter = '') =>
    ({ id, inning: 1, over, ball: n, extra, scoreAfter }) as BallEntry;

  it('keeps the newer id of a ball the upstream re-published', () => {
    const kept = dedupeDeliveries([d('902', 40, 1, null, '229/6'), d('901', 40, 1, null, '229/6')]);
    assert.deepEqual(kept.map((b) => b.id), ['902']);
  });

  it('keeps two wides on the same ball number apart', () => {
    const balls = [d('3', 12, 1), d('2', 12, 1, 'wide', '81/2'), d('1', 12, 1, 'wide', '80/2')];
    assert.equal(dedupeDeliveries(balls).length, 3);
  });
});

describe('lastIndexAtOrBelow', () => {
  const scan = (keys: number[], x: number) => {
    let last = -1;
    for (let i = 0; i < keys.length; i++) if (keys[i] <= x) last = i;
    return last;
  };

  it('agrees with a linear scan on unsorted keys with gaps and NaN', () => {
    let seed = 7;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let round = 0; round < 200; round++) {
      const keys = Array.from({ length: Math.floor(rand() * 40) }, () => (rand() < 0.1 ? NaN : Math.floor(rand() * 30)));
      const find = lastIndexAtOrBelow(keys);
      for (let x = -2; x < 33; x++) assert.equal(find(x), scan(keys, x), `keys ${keys} x ${x}`);
    }
  });

  it('answers -1 for no keys, or none low enough', () => {
    assert.equal(lastIndexAtOrBelow([])(5), -1);
    assert.equal(lastIndexAtOrBelow([4, 6])(3), -1);
  });
});
