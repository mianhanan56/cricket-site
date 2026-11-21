import { afterEach, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { LiveHub, MAX_REFRESHES_PER_ALARM } from '../src/live';
import { READ_DEADLINE_MS } from '../src/upstream';

// The hub against fake sockets, fake alarm storage and a scripted upstream, on mocked clocks.
Object.assign(globalThis, { WebSocketRequestResponsePair: class {} });
console.warn = console.info = () => {};

interface FakeSocket {
  attachment: { topics: string[] };
  sent: { type: string; topic: string }[];
  deserializeAttachment(): unknown;
  serializeAttachment(a: { topics: string[] }): void;
  send(text: string): void;
  close(): void;
}

const socket = (...topics: string[]): FakeSocket => ({
  attachment: { topics },
  sent: [],
  deserializeAttachment() {
    return this.attachment;
  },
  serializeAttachment(a) {
    this.attachment = a;
  },
  send(text) {
    this.sent.push(JSON.parse(text));
  },
  close() {},
});

let sockets: FakeSocket[] = [];
let alarmAt: number | null = null;
let calls: string[] = [];
let signals: AbortSignal[] = [];
let upstream: (url: string) => Response = () => Response.json({ 0: {} });

const hub = () =>
  new LiveHub(
    {
      getWebSockets: () => sockets,
      setWebSocketAutoResponse() {},
      storage: {
        getAlarm: async () => alarmAt,
        setAlarm: async (at: number) => void (alarmAt = at),
        deleteAlarm: async () => void (alarmAt = null),
      },
    } as never,
    {}
  );

const turn = () => new Promise((resolve) => setImmediate(resolve));
const keyOf = (url: string) => new URL(url).searchParams.get('key');

beforeEach(() => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
  sockets = [];
  alarmAt = null;
  calls = [];
  signals = [];
  upstream = () => Response.json({ 0: {} });
  Object.assign(globalThis, {
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      calls.push(url);
      if (init?.signal) signals.push(init.signal);
      return upstream(url);
    },
  });
});

afterEach(() => mock.timers.reset());

test('a body that never finishes reading does not hold up the other topics or the next alarm', async () => {
  const stuck = socket('card:AAA1');
  const fine = socket('card:BBB2');
  sockets = [stuck, fine];
  upstream = (url) => (keyOf(url) === 'AAA1' ? new Response(new ReadableStream({ start() {} })) : Response.json({ 0: {} }));

  const live = hub();
  const run = live.alarm();
  for (let i = 0; i < 10; i++) await turn();
  // Re-armed before the stuck read can settle.
  assert.ok(alarmAt !== null);
  assert.deepEqual(fine.sent.map((f) => f.type), ['card:update']);

  assert.ok(signals.every((s) => !s.aborted));
  mock.timers.tick(READ_DEADLINE_MS);
  await run;
  assert.equal(calls.length, 2);
  // The stuck read is let go, not left holding a connection.
  assert.equal(signals.filter((s) => s.aborted).length, 1);
  assert.ok(alarmAt !== null && alarmAt > Date.now());
});

test('one alarm refreshes at most the cap; the rest go first on the next', async () => {
  const keys = Array.from({ length: MAX_REFRESHES_PER_ALARM + 10 }, (_, i) => `K${i}`);
  sockets = [socket(...keys.slice(0, 30).map((k) => `card:${k}`)), socket(...keys.slice(30).map((k) => `card:${k}`))];
  const live = hub();

  await live.alarm();
  assert.equal(calls.length, MAX_REFRESHES_PER_ALARM);
  const first = new Set(calls.map(keyOf));

  calls = [];
  await live.alarm();
  assert.equal(calls.length, 10);
  for (const url of calls) assert.ok(!first.has(keyOf(url)));
});

test('a failing topic tells its subscribers it is stale, and its next update marks it live again', async () => {
  const reader = socket('card:AAA1');
  sockets = [reader];
  const live = hub();

  await live.alarm();
  assert.deepEqual(reader.sent.map((f) => f.type), ['card:update']);

  upstream = () => new Response('busy', { status: 500 });
  for (let i = 0; i < 2; i++) {
    mock.timers.tick(60_000);
    await live.alarm();
  }
  assert.deepEqual(reader.sent.map((f) => f.type), ['card:update', 'topic:stale']);
  assert.equal(reader.sent[1].topic, 'card:AAA1');

  // The same body as before still goes out: it is the client's signal that the topic is back.
  upstream = () => Response.json({ 0: {} });
  mock.timers.tick(60_000);
  await live.alarm();
  assert.deepEqual(reader.sent.map((f) => f.type), ['card:update', 'topic:stale', 'card:update']);

  mock.timers.tick(60_000);
  await live.alarm();
  assert.equal(reader.sent.length, 3);
});
