import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildIndex, isRecentSearch, querySearch, seriesInitials } from '../lib/searchIndex';

describe('series initials', () => {
  it('adds the initials leagues are known by', () => {
    assert.equal(seriesInitials('Indian Premier League 2026'), 'ipl');
    assert.equal(seriesInitials('Pakistan Super League 2026'), 'psl');
    assert.equal(seriesInitials('Womens Big Bash League 2026'), 'wbbl');
    assert.equal(seriesInitials('International League T20 2025/26'), 'ilt20');
  });

  it('gives a one-word name none', () => {
    assert.equal(seriesInitials('SA20'), null);
  });

  it('finds a series by its initials, whole only', () => {
    const index = buildIndex([], {
      players: [],
      teams: [],
      series: [
        { id: '2A', name: 'Indian Premier League 2026', span: 'Mar – May 2026' },
        { id: '2B', name: 'Ireland Inter-Provincial Limited Over Cup 2026', span: 'May 2026' },
      ],
    });
    assert.deepEqual(
      querySearch(index, 'IPL').map((e) => e.id),
      ['2A']
    );
  });
});

describe('recent search validation', () => {
  it('keeps in-app entries', () => {
    assert.equal(isRecentSearch({ label: 'Pakistan', href: '/teams/1', type: 'team' }), true);
    assert.equal(isRecentSearch({ label: 'babar', href: '/search?q=babar', type: 'query' }), true);
  });

  it('drops hrefs that leave the site and unknown types', () => {
    assert.equal(isRecentSearch({ label: 'x', href: '//evil.example', type: 'team' }), false);
    assert.equal(isRecentSearch({ label: 'x', href: '/\\evil.example', type: 'team' }), false);
    assert.equal(isRecentSearch({ label: 'x', href: 'https://evil.example', type: 'team' }), false);
    assert.equal(isRecentSearch({ label: 'x', href: 'javascript:alert(1)', type: 'team' }), false);
    assert.equal(isRecentSearch({ label: 'x', href: '/\t/evil.example', type: 'team' }), false);
    assert.equal(isRecentSearch({ label: 'x', href: '/\n/evil.example', type: 'team' }), false);
    assert.equal(isRecentSearch({ label: 'x', href: '/teams/1', type: 'script' }), false);
    assert.equal(isRecentSearch(null), false);
  });
});
