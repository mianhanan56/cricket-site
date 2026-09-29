import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { InningsScore } from '../types';
import { reachedByCard, type BallEntry } from '../lib/balls';

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
