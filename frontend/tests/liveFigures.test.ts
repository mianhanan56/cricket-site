import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { InningsScore, PlayerFormEntry, PlayerSeriesInnings } from '../types';
import type { SeriesLists } from '../lib/playerSeries';
import { recentSeriesMatches, withCardFigures, withCardForm } from '../lib/liveFigures';

const NOW = Date.UTC(2026, 10, 20, 12);
const today = new Date(NOW - 3_600_000).toISOString();

const inn = (over: Partial<PlayerSeriesInnings>): PlayerSeriesInnings => ({
  matchId: '150U',
  matchLabel: '3rd One Day',
  inningsOfMatch: 1,
  opponent: 'UAE',
  date: today,
  runs: 10,
  balls: 18,
  notOut: false,
  wickets: 0,
  ...over,
});

const lists = (bowling: PlayerSeriesInnings[], batting: PlayerSeriesInnings[] = []): SeriesLists =>
  ({
    batting: { series: [{ id: 'S', name: 'Asia Cup', formats: [{ code: 1, label: 'List A', innings: batting }] }] },
    bowling: { series: [{ id: 'S', name: 'Asia Cup', formats: [{ code: 1, label: 'List A', innings: bowling }] }] },
  }) as unknown as SeriesLists;

const card = (...innings: Array<{ batting?: object[]; bowling?: object[] }>) => innings as unknown as InningsScore[];
const bowler = (overs: number, runs: number, wickets: number) => ({ playerId: '5ZZ', name: 'Ahmed Daniyal', overs, maidens: 0, runs, wickets, economy: 0 });

describe("a player's figures from the live scorecard", () => {
  it('replaces a stale bowling innings with the card, overs as balls', () => {
    const out = withCardFigures(lists([inn({})]), '5ZZ', new Map([['150U', card({ bowling: [bowler(3.1, 11, 0)] })]]));
    const [i] = out.bowling.series[0].formats[0].innings;
    assert.deepEqual([i.runs, i.balls, i.wickets], [11, 19, 0]);
  });

  it("maps a Test's second innings to the player's second line, and batting not-outs", () => {
    const c = card(
      { batting: [{ playerId: '5ZZ', runs: 40, balls: 60, out: true }] },
      { bowling: [bowler(20, 70, 2)] },
      { batting: [{ playerId: '5ZZ', runs: 12, balls: 15, out: false }] }
    );
    const out = withCardFigures(lists([], [inn({ inningsOfMatch: 1 }), inn({ inningsOfMatch: 2 })]), '5ZZ', new Map([['150U', c]]));
    const [first, second] = out.batting.series[0].formats[0].innings;
    assert.deepEqual([first.runs, first.notOut, second.runs, second.balls, second.notOut], [40, false, 12, 15, true]);
  });

  it('leaves innings without a card, or without a line for the player, as they were', () => {
    const before = lists([inn({ matchId: 'OLD' }), inn({})]);
    const out = withCardFigures(before, '5ZZ', new Map([['150U', card({ bowling: [{ ...bowler(2, 9, 1), playerId: 'X' }] })]]));
    assert.deepEqual(out.bowling.series[0].formats[0].innings, before.bowling.series[0].formats[0].innings);
  });

  it('only counts matches recent enough to be in progress', () => {
    const old = new Date(NOW - 10 * 86_400_000).toISOString();
    assert.deepEqual(recentSeriesMatches(lists([inn({}), inn({ matchId: 'OLD', date: old })]), NOW), ['150U']);
  });

  it('refreshes recent-form entries, newest first', () => {
    const entry = (figures: string): PlayerFormEntry => ({ figures, notOut: false, fixture: 'PAK-A vs UAE', format: 'List A', matchId: '150U', date: today });
    const [e] = withCardForm([entry('0-10')], 'bowling', '5ZZ', new Map([['150U', card({ bowling: [bowler(3.1, 11, 0)] })]]));
    assert.equal(e.figures, '0-11');
  });
});
