import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index';

// The handler against a fake edge cache and a scripted upstream.
const cache = new Map<string, Response>();
const pending: Promise<unknown>[] = [];
let calls: string[] = [];
let upstream: (url: string) => Response | Promise<Response> = () => Response.json({ a: 1 });

Object.assign(globalThis, {
  caches: {
    default: {
      match: async (req: Request) => cache.get(req.url)?.clone(),
      put: async (req: Request, res: Response) => void cache.set(req.url, res.clone()),
    },
  },
  fetch: async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push(url);
    return upstream(url);
  },
});
console.warn = () => {};

const SITE = 'https://pulsecrease.vercel.app';
const HOST = 'https://pulsecrease-api.example.workers.dev';
const SQL_ERROR = JSON.stringify({ error: { code: 'ER_SP_UNDECLARED_VAR', sql: 'SELECT pr.rating FROM players_ranking pr' } });

const hub = { idFromName: () => 'live', get: () => ({ fetch: async () => new Response('hub') }) };
const env = (extra: object = {}) => ({ ALLOWED_ORIGINS: SITE, LIVE_HUB: hub, ...extra }) as never;
const ctx = { waitUntil: (p: Promise<unknown>) => void pending.push(p), passThroughOnException() {} } as never;
const settle = () => Promise.all(pending.splice(0));

const get = (path: string, init: { headers?: Record<string, string>; env?: object; host?: string } = {}) =>
  worker.fetch(new Request(`${init.host ?? HOST}${path}`, { headers: init.headers }) as never, env(init.env), ctx);

beforeEach(() => {
  cache.clear();
  calls = [];
  upstream = () => Response.json({ a: 1 });
});

test('health says the Worker is up and nothing about where its data comes from', async () => {
  for (const path of ['/', '/health']) {
    const res = await get(path);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: 'ok' });
  }
});

test('an unknown path does not list the routes', async () => {
  const res = await get('/nope');
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: 'Not found' });
});

test("an upstream error reaches the caller as its status only", async () => {
  upstream = () => new Response(SQL_ERROR, { status: 400 });
  const res = await get('/rankings/players?page=2');
  const text = await res.text();
  assert.equal(res.status, 502);
  assert.deepEqual(JSON.parse(text), { error: 'Upstream error', status: 400 });
  for (const leak of ['SELECT', 'players_ranking', 'crickapi', 'goscorer', 'https://']) assert.ok(!text.includes(leak), leak);
});

test('an unreachable upstream is reported without the error text', async () => {
  upstream = () => {
    throw new Error('connect ECONNREFUSED 10.0.0.7:443');
  };
  const res = await get('/match/info?key=13Q6');
  assert.equal(res.status, 502);
  assert.deepEqual(await res.json(), { error: 'Upstream unreachable' });
});

test('a malformed key is refused before any upstream call', async () => {
  for (const key of ['A'.repeat(200), 'AUDIT%20KEY.0003', '%5E2MT']) {
    const res = await get(`/match/info?key=${key}`);
    assert.equal(res.status, 400);
  }
  assert.equal((await get('/rankings/players?page=AUDITPAGE')).status, 400);
  assert.equal(calls.length, 0);
});

test('a key the upstream refuses is asked for once, then answered from the cache', async () => {
  upstream = () => new Response('{"err":"Key Not found"}', { status: 400 });
  const first = await get('/player/overview?key=ZZZZ');
  await settle();
  const second = await get('/player/overview?key=ZZZZ');
  assert.equal(first.status, 502);
  assert.equal(second.status, 502);
  assert.deepEqual(await second.json(), { error: 'Upstream error', status: 400 });
  assert.equal(calls.length, 1);
});

test('an upstream outage or throttle is not held', async () => {
  for (const status of [500, 429]) {
    calls = [];
    upstream = () => new Response('busy', { status });
    const res = await get(`/player/overview?key=K${status}`);
    await settle();
    await get(`/player/overview?key=K${status}`);
    assert.equal(res.status, status === 429 ? 429 : 502);
    assert.equal(calls.length, 2, `status ${status}`);
  }
});

test('a refusal during a background refresh keeps the body being served', async () => {
  const served = await (await get('/match/info?key=13Q6')).text();
  await settle();
  for (const [url, res] of cache) {
    const headers = new Headers(res.headers);
    headers.set('x-worker-age-basis', '0');
    cache.set(url, new Response(await res.text(), { headers }));
  }

  upstream = () => new Response('gone', { status: 404 });
  const stale = await get('/match/info?key=13Q6');
  await settle();
  const after = await get('/match/info?key=13Q6');
  assert.equal(stale.headers.get('X-Worker-Cache'), 'STALE');
  assert.equal(after.status, 200);
  assert.equal(await after.text(), served);
});

test('an address over its rate is turned away before the route runs', async () => {
  const seen: string[] = [];
  const limiter = { limit: async ({ key }: { key: string }) => (seen.push(key), { success: false }) };
  const res = await get('/match/info?key=13Q6', { env: { RATE_LIMITER: limiter }, headers: { 'CF-Connecting-IP': '203.0.113.9' } });
  assert.equal(res.status, 429);
  assert.ok(res.headers.get('Retry-After'));
  assert.deepEqual(seen, ['203.0.113.9']);
  assert.equal(calls.length, 0);
});

test('only the site gets a CORS grant; localhost only from a local Worker', async () => {
  const grant = async (origin: string, host?: string) =>
    (await get('/health', { headers: { Origin: origin }, host })).headers.get('Access-Control-Allow-Origin');
  assert.equal(await grant(SITE), SITE);
  assert.equal(await grant('https://evil.example'), null);
  assert.equal(await grant(`${SITE}.evil.example`), null);
  assert.equal(await grant('null'), null);
  assert.equal(await grant('http://localhost:3005'), null);
  assert.equal(await grant('http://localhost:3005', 'http://localhost:8788'), 'http://localhost:3005');
  assert.equal(await grant('https://evil.example', 'http://localhost:8788'), null);
});

test('the live socket refuses other sites, and localhost in production', async () => {
  const dial = (origin?: string, host?: string) =>
    get('/live', { host, headers: { Upgrade: 'websocket', ...(origin ? { Origin: origin } : {}) } });
  assert.equal((await dial('https://evil.example')).status, 403);
  assert.equal((await dial('http://localhost:3005')).status, 403);
  assert.equal(await (await dial(SITE)).text(), 'hub');
  assert.equal(await (await dial('http://localhost:3005', 'http://localhost:8788')).text(), 'hub');
});
