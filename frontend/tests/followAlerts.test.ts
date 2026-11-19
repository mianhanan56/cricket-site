import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Follows } from '../lib/follows';
import { followRules, isFollowRule } from '../lib/followAlerts';

const follows: Follows = {
  teams: [{ id: 'U', name: 'Pakistan', shortName: 'PAK', logo: null }],
  series: [{ id: '2M3', name: 'ODI Tri Series' }],
  players: [{ id: '1IG', name: 'Harry Brook' }],
};
const none: Follows = { teams: [], series: [], players: [] };

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
