import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { PlayerSeriesInnings, PlayerSeriesPage, PlayerSeriesRecord } from '../types';
import {
  battingSummary,
  bowlingSummary,
  defaultSeries,
  firstLists,
  limitingDiscipline,
  listsCovering,
  mergeLists,
  seriesFormatOptions,
  type PageFetcher,
  type PlayerSeries,
  type SeriesLists,
} from '../lib/playerSeries';

const inn = (extra: Partial<PlayerSeriesInnings>): PlayerSeriesInnings => ({
  matchId: 'm1',
  matchLabel: '1st Test',
  inningsOfMatch: 1,
  opponent: 'IND',
  date: '2026-08-01',
  runs: 0,
  balls: 0,
  notOut: false,
  wickets: 0,
  ...extra,
});

const record = (id: string, start: string, innings: PlayerSeriesInnings[] = [inn({})]): PlayerSeriesRecord => ({
  id,
  name: `Series ${id}`,
  team: 'ENG',
  start,
  end: start,
  formats: [{ code: 1, label: 'ODI', innings }],
});

describe('battingSummary', () => {
  it('averages over dismissals only and marks an unbeaten top score', () => {
    const s = battingSummary([
      inn({ matchId: 'm1', runs: 40, balls: 50 }),
      inn({ matchId: 'm1', inningsOfMatch: 2, runs: 112, balls: 160, notOut: true }),
      inn({ matchId: 'm2', runs: 50, balls: 40 }),
    ]);
    assert.equal(s.matches, 2);
    assert.equal(s.innings, 3);
    assert.equal(s.runs, 202);
    assert.equal(s.notOuts, 1);
    assert.equal(s.average, 101);
    assert.equal(s.strikeRate, 80.8);
    assert.equal(s.highest, '112*');
    assert.equal(s.fifties, 1);
    assert.equal(s.hundreds, 1);
  });

  it('has no average when never dismissed, and prefers the unbeaten score on a tie', () => {
    const s = battingSummary([inn({ runs: 30, balls: 20 }), inn({ matchId: 'm2', runs: 30, balls: 25, notOut: true })]);
    assert.equal(s.highest, '30*');
    const unbeaten = battingSummary([inn({ runs: 12, balls: 0, notOut: true })]);
    assert.equal(unbeaten.average, null);
    assert.equal(unbeaten.strikeRate, null);
  });

  it('reads an empty record as dashes rather than zeros', () => {
    const s = battingSummary([]);
    assert.equal(s.highest, '—');
    assert.equal(s.average, null);
  });
});

describe('bowlingSummary', () => {
  it('works in overs, picks the best figures by wickets then runs, and counts hauls', () => {
    const s = bowlingSummary(
      [
        inn({ balls: 60, runs: 41, wickets: 3 }),
        inn({ matchId: 'm2', balls: 57, runs: 30, wickets: 3 }),
        inn({ matchId: 'm3', balls: 60, runs: 55, wickets: 5 }),
        inn({ matchId: 'm4', balls: 48, runs: 20, wickets: 4 }),
      ],
      1
    );
    assert.deepEqual(s.workload, { value: '37.3', unit: 'overs' });
    assert.equal(s.wickets, 15);
    assert.equal(s.economy, Math.round((146 / (225 / 6)) * 100) / 100);
    assert.equal(s.average, Math.round((146 / 15) * 100) / 100);
    assert.equal(s.strikeRate, 15);
    assert.equal(s.best, '5-55');
    assert.equal(s.fourFors, 1);
    assert.equal(s.fiveFors, 1);
  });

  it('counts The Hundred in balls and five-ball sets', () => {
    const s = bowlingSummary([inn({ balls: 20, runs: 25, wickets: 1 })], 5);
    assert.deepEqual(s.workload, { value: '20', unit: 'balls' });
    assert.equal(s.economy, 6.25);
  });

  it('has no rates without balls or wickets', () => {
    const s = bowlingSummary([inn({ balls: 0, runs: 0, wickets: 0 })], 2);
    assert.equal(s.economy, null);
    assert.equal(s.average, null);
    assert.equal(s.strikeRate, null);
  });
});

describe('series lists', () => {
  const lists = (batting: PlayerSeriesRecord[], battingNext: number | null, bowling: PlayerSeriesRecord[], bowlingNext: number | null): SeriesLists => ({
    batting: { series: batting, next: battingNext },
    bowling: { series: bowling, next: bowlingNext },
  });

  it('holds back a series the other list has not reached yet', () => {
    const merged = mergeLists(
      lists([record('a', '2026-08-01'), record('b', '2026-05-01')], 1, [record('a', '2026-08-01')], 1)
    );
    assert.deepEqual(merged.map((s) => s.id), ['a']);
  });

  it('shows everything once both lists are read out, newest first', () => {
    const merged = mergeLists(
      lists([record('b', '2026-05-01'), record('a', '2026-08-01')], null, [record('a', '2026-08-01')], null)
    );
    assert.deepEqual(merged.map((s) => s.id), ['a', 'b']);
    assert.equal(merged[1].bowling.length, 0);
  });

  it('pages the list that is holding the merge back', () => {
    const l = lists([record('a', '2026-08-01'), record('b', '2026-05-01')], 1, [record('a', '2026-08-01')], 1);
    assert.equal(limitingDiscipline(l), 'bowling');
    assert.equal(limitingDiscipline(lists([], null, [], null)), null);
  });

  it('reads older pages until the asked-for series is listed', async () => {
    const pages: Record<string, PlayerSeriesPage[]> = {
      batting: [
        { series: [record('a', '2026-08-01')], more: true },
        { series: [record('old', '2025-01-01')], more: false },
      ],
      bowling: [
        { series: [record('a', '2026-08-01')], more: true },
        { series: [record('old', '2025-01-01')], more: false },
      ],
    };
    const asked: string[] = [];
    const fetchPage: PageFetcher = async (d, page) => {
      asked.push(`${d}:${page}`);
      return pages[d][page];
    };
    const first = await firstLists(fetchPage);
    const covered = await listsCovering(first, 'old', fetchPage, 8);
    assert.ok(mergeLists(covered).some((s) => s.id === 'old'));
    assert.deepEqual(asked.sort(), ['batting:0', 'batting:1', 'bowling:0', 'bowling:1']);
  });
});

describe('defaultSeries', () => {
  const series = (id: string, start: string, end: string, latest: string): PlayerSeries => ({
    id,
    name: id,
    team: null,
    start,
    end,
    batting: [],
    bowling: [],
    latest,
  });

  it('opens on a running series, counting its last day', () => {
    const picked = defaultSeries(
      [series('done', '2026-07-01', '2026-07-20', '2026-07-20'), series('on', '2026-08-01', '2026-08-10', '2026-08-09')],
      new Date('2026-08-10T15:00:00Z')
    );
    assert.equal(picked?.id, 'on');
  });

  it('falls back to the series that finished last', () => {
    const picked = defaultSeries(
      [series('earlier', '2026-06-01', '2026-06-20', '2026-06-20'), series('later', '2026-07-01', '2026-07-20', '2026-07-19')],
      new Date('2026-09-01T00:00:00Z')
    );
    assert.equal(picked?.id, 'later');
    assert.equal(defaultSeries([]), null);
  });
});

describe('seriesFormatOptions', () => {
  it('offers All only when there is a choice, in the filter order', () => {
    assert.deepEqual(seriesFormatOptions([1]), []);
    assert.deepEqual(
      seriesFormatOptions([2, 3]).map((f) => f.value),
      ['all', 'test', 't20']
    );
  });
});
