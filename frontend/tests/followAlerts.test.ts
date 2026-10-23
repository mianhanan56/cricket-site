import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { NewsArticle, NewsTag } from '../types';
import type { Follows } from '../lib/follows';
import { NEWS_FRESH_MS, followRules, followedNews, isFollowRule } from '../lib/followAlerts';

const follows: Follows = {
  teams: [{ id: 'U', name: 'Pakistan', shortName: 'PAK', logo: null }],
  series: [{ id: '2M3', name: 'ODI Tri Series' }],
  players: [{ id: '1IG', name: 'Harry Brook' }],
};
const none: Follows = { teams: [], series: [], players: [] };

const NOW = Date.parse('2026-10-23T12:00:00Z');

function article(id: string, minutesAgo: number, tags: NewsTag[]): NewsArticle {
  return {
    id,
    slug: id,
    title: `Story ${id}`,
    excerpt: null,
    image: null,
    imageCaption: null,
    publishedAt: new Date(NOW - minutesAgo * 60_000).toISOString(),
    author: null,
    category: null,
    tags,
  };
}

describe('followRules', () => {
  it('covers every chosen moment for followed teams and series, and 50s/100s for players', () => {
    const rules = followRules(follows, { on: true, off: [] });
    assert.equal(rules.length, 2);
    assert.deepEqual(rules[0].scope, { kind: 'FOLLOWED' });
    assert.deepEqual(rules[0].triggers, ['MATCH_START', 'WICKET', 'FIFTY', 'HUNDRED', 'CLOSE_CHASE', 'RESULT']);
    assert.deepEqual(rules[1].scope, { kind: 'PLAYER', id: '1IG', name: 'Harry Brook' });
    assert.deepEqual(rules[1].triggers, ['FIFTY', 'HUNDRED']);
    assert.ok(rules.every((r) => isFollowRule(r.id) && r.enabled && r.action.system));
  });

  it('leaves out switched-off moments and sends nothing when off or following nothing', () => {
    const rules = followRules(follows, { on: true, off: ['wicket', 'milestone'] });
    assert.equal(rules.length, 1);
    assert.deepEqual(rules[0].triggers, ['MATCH_START', 'CLOSE_CHASE', 'RESULT']);
    assert.deepEqual(followRules(follows, { on: false, off: [] }), []);
    assert.deepEqual(followRules(none, { on: true, off: [] }), []);
  });
});

describe('followedNews', () => {
  it('keeps fresh stories tagged with something followed, newest first, with the names', () => {
    const found = followedNews(
      [
        article('a', 30, [{ kind: 'team', id: 'U', name: 'Pakistan' }]),
        article('b', 10, [
          { kind: 'series', id: '2M3', name: 'ODI Tri Series' },
          { kind: 'player', id: '1IG', name: 'Harry Brook' },
        ]),
        article('c', 5, [{ kind: 'team', id: 'O', name: 'India' }]),
      ],
      follows,
      NOW
    );
    assert.deepEqual(
      found.map((f) => [f.article.id, f.about]),
      [
        ['b', ['ODI Tri Series', 'Harry Brook']],
        ['a', ['Pakistan']],
      ]
    );
  });

  it('drops stories older than the fresh window', () => {
    const old = article('d', NEWS_FRESH_MS / 60_000 + 1, [{ kind: 'team', id: 'U', name: 'Pakistan' }]);
    assert.deepEqual(followedNews([old], follows, NOW), []);
  });
});
