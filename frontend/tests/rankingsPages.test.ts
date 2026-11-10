import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allRankingsQueries, rankingsMeta, rankingsPath, RANKINGS_DEFAULTS } from '../lib/rankingsPages';

test('default list is the bare /rankings URL', () => {
  assert.equal(rankingsPath(RANKINGS_DEFAULTS), '/rankings');
});

test('team lists drop the category that does not apply to them', () => {
  assert.equal(
    rankingsPath({ group: 'teams', format: 't20i', gender: 'women', category: 'bowling' }),
    '/rankings?group=teams&format=t20i&gender=women'
  );
});

test('every published list has its own URL and title, and no women’s Test list', () => {
  const all = allRankingsQueries();
  assert.equal(all.length, 20);
  assert.equal(new Set(all.map(rankingsPath)).size, 20);
  assert.equal(new Set(all.map((q) => rankingsMeta(q).title)).size, 20);
  assert.ok(!all.some((q) => q.gender === 'women' && q.format === 'test'));
});

test('titles name the list', () => {
  assert.equal(
    rankingsMeta({ group: 'players', format: 'odi', gender: 'men', category: 'all-rounder' }).title,
    "ICC Men's ODI All-rounder Rankings"
  );
});
