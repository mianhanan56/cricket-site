import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  admit,
  IDLE_SOCKET_MS,
  isIdle,
  MAX_MESSAGES_PER_WINDOW,
  MAX_TOPICS,
  MAX_TOPICS_PER_SOCKET,
  MESSAGE_WINDOW_MS,
  parseTopic,
  withinMessageRate,
  type Attachment,
} from '../src/hubRules';

const hub = (topics: string[] = [], size = topics.length) => ({ has: (t: string) => topics.includes(t), size });
const known = (...ids: string[]) => (key: string) => ids.includes(key);

test('a topic is the match list or one match by key', () => {
  assert.deepEqual(parseTopic('matches'), { kind: 'matches', key: '' });
  assert.deepEqual(parseTopic('card:13Q6'), { kind: 'card', key: '13Q6' });
  assert.deepEqual(parseTopic('feed:13Q6'), { kind: 'feed', key: '13Q6' });
  for (const bad of ['card:', 'card:a b', `card:${'A'.repeat(13)}`, 'card:13Q6:x', 'news:13Q6', 'card:a_b', 42, null, {}]) {
    assert.equal(parseTopic(bad), null, JSON.stringify(bad));
  }
});

test('a card or feed topic is admitted only for a match in the list', () => {
  const added = admit(['matches', 'card:13Q6', 'feed:ZZZZ', 'card:RANDOM1'], new Set(), hub(), known('13Q6'));
  assert.deepEqual(added, ['matches', 'card:13Q6']);
});

test('nothing is admitted twice', () => {
  assert.deepEqual(admit(['matches', 'matches', 'card:A1'], new Set(['card:A1']), hub(), known('A1')), ['matches']);
});

test('a socket stops at its ceiling', () => {
  const ids = Array.from({ length: 60 }, (_, i) => `M${i}`);
  const added = admit(ids.map((id) => `card:${id}`), new Set(['matches']), hub(), known(...ids));
  assert.equal(added.length, MAX_TOPICS_PER_SOCKET - 1);
});

test('a full hub takes no new topic but still shares the ones it runs', () => {
  const added = admit(['card:A1', 'card:B2'], new Set(), hub(['card:A1'], MAX_TOPICS), known('A1', 'B2'));
  assert.deepEqual(added, ['card:A1']);
});

test('messages are counted per window', () => {
  const attachment: Attachment = { topics: [] };
  for (let i = 0; i < MAX_MESSAGES_PER_WINDOW; i++) assert.ok(withinMessageRate(attachment, 1_000));
  assert.equal(withinMessageRate(attachment, 1_500), false);
  assert.ok(withinMessageRate(attachment, 1_000 + MESSAGE_WINDOW_MS));
});

test('only a socket that never subscribed goes idle', () => {
  const now = 10 * IDLE_SOCKET_MS;
  assert.ok(isIdle({ topics: [], at: now - IDLE_SOCKET_MS }, now));
  assert.equal(isIdle({ topics: [], at: now - 1_000 }, now), false);
  assert.equal(isIdle({ topics: ['matches'], at: 0 }, now), false);
});
