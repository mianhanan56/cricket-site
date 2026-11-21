// Edge proxy in front of the upstream's internal APIs: allowlisted GET routes (routes.ts),
// an edge cache, CORS, and stale data rather than an error when the upstream hiccups.
// No bot-protection circumvention: if the upstream adds a challenge, stop (README).

import { UPSTREAMS } from './upstreams';
import { fetchUpstream, UPSTREAM_TIMEOUT_MS } from './upstream';
import { merge, remember, splitKnown, type Mapping } from './names';
import { SHAPE_VERSION } from './shape';
import { SHAPES } from './shapes';
import {
  matchRoute,
  ParamError,
  readParams,
  upstreamTarget,
  type ParamValue,
  type RouteDef,
} from './routes';

export { LiveHub } from './live';

export interface Env {
  ALLOWED_ORIGINS: string;
  LIVE_HUB: DurableObjectNamespace;
  /** Per-address request ceiling (wrangler.toml `ratelimits`). Absent in a deploy without the binding. */
  RATE_LIMITER?: RateLimit;
  /** Shared with the site (`wrangler secret put`); proves a call came through it, so its client-IP header can be trusted. */
  WORKER_PROXY_SECRET?: string;
}

export const PROXY_SECRET_HEADER = 'x-pulse-proxy-secret';
export const CLIENT_IP_HEADER = 'x-pulse-client-ip';
const ADDRESS = /^[0-9A-Fa-f:.]{2,45}$/;

// How long past its TTL a cached body may still be served when upstream fails.
// Stale scores beat a broken page.
const STALE_GRACE_SECONDS = 300;

// Ceiling on one upstream run, body included; past the fetch timeout, under the frontend's 15s.
const RUN_DEADLINE_MS = UPSTREAM_TIMEOUT_MS + 2_000;

// An upstream 4xx is held this long, so asking again for a key it refuses doesn't reach it each time.
const REFUSAL_TTL_SECONDS = 60;
const REFUSAL_HEADER = 'x-worker-upstream-status';
const RETRY_AFTER_SECONDS = 10;

// Upstream calls open in this isolate, by cache key: requests arriving while an entry is
// missing or stale join the one call instead of each going upstream.
const inFlight = new Map<string, Promise<FetchOutcome>>();

/** A fetched body, held as bytes so every joining caller can build its own Response. */
interface StoredBody {
  body: ArrayBuffer;
  contentType: string;
}

/** What one upstream attempt produced. `status: 0` means the call never landed. */
type FetchOutcome = { ok: true; stored: StoredBody } | { ok: false; status: number };

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env, url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    const bucket = rateBucket(request, env);
    if (bucket.limiter) {
      const { success } = await bucket.limiter.limit({ key: bucket.key });
      if (!success) {
        cors.set('Retry-After', String(RETRY_AFTER_SECONDS));
        return json({ error: 'Too many requests' }, 429, cors);
      }
    }
    // WebSockets skip CORS, so the origin allowlist is enforced here by hand.
    if (url.pathname === '/live') {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
        return json({ error: 'Expected a WebSocket upgrade' }, 426, cors);
      }
      const origin = request.headers.get('Origin');
      if (origin && !originAllowed(origin, env, url)) {
        return json({ error: 'Origin not allowed' }, 403, cors);
      }
      return env.LIVE_HUB.get(env.LIVE_HUB.idFromName('live')).fetch(request);
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return json({ error: 'Method not allowed' }, 405, cors);
    }

    // Nothing here names a route or an upstream: both are in the source, not on the wire.
    if (url.pathname === '/' || url.pathname === '/health') {
      return json({ status: 'ok' }, 200, cors);
    }

    const route = matchRoute(url.pathname);
    if (!route) return json({ error: 'Not found' }, 404, cors);

    let params: Record<string, ParamValue>;
    try {
      params = readParams(route, url.searchParams);
    } catch (err) {
      if (err instanceof ParamError) return json({ error: err.message, path: url.pathname }, 400, cors);
      throw err;
    }

    return route.match === '/mapping'
      ? serveMapping(route, params, cors, ctx)
      : serve(route, params, cors, ctx);
  },
} satisfies ExportedHandler<Env>;

/**
 * What a request is counted against. Browsers reach the Worker through the site's rewrite and
 * server renders call it from the site's functions, so without the secret every reader shares
 * the site's address.
 */
function rateBucket(request: Request, env: Env): { limiter?: RateLimit; key: string } {
  const direct = { limiter: env.RATE_LIMITER, key: request.headers.get('CF-Connecting-IP') ?? 'unknown' };
  const sent = request.headers.get(PROXY_SECRET_HEADER);
  if (!env.WORKER_PROXY_SECRET || !sent || !sameSecret(sent, env.WORKER_PROXY_SECRET)) return direct;
  const client = request.headers.get(CLIENT_IP_HEADER)?.trim();
  // The site's own render: one shared bucket would let anyone exhaust it with uncached pages.
  if (!client) return { key: 'server' };
  return { limiter: env.RATE_LIMITER, key: ADDRESS.test(client) ? client : 'unknown' };
}

function sameSecret(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

/** One upstream call through the edge cache: fresh hit, stale-while-refresh, or a single-flighted miss. */
async function serve(
  route: RouteDef,
  params: Record<string, ParamValue>,
  cors: Headers,
  ctx: ExecutionContext
): Promise<Response> {
  // Cache key is derived from the upstream call, not the caller's URL, so
  // every origin shares one entry and client-side noise cannot fragment it.
  // The Cache API only stores GET, so a POST upstream is keyed by a synthetic
  // GET URL carrying the canonical params.
  const { path, query } = upstreamTarget(route, params);
  const shaped = `shape=${SHAPE_VERSION}`;
  const cacheKey = new Request(`${UPSTREAMS[route.base]}${path}?${query ? `${query}&` : ''}${shaped}`, {
    method: 'GET',
  });
  const cache = caches.default;

  const cached = await cache.match(cacheKey);
  if (cached) {
    const refused = cached.headers.get(REFUSAL_HEADER);
    if (refused) return upstreamError(Number(refused), cors);

    const basis = Number(cached.headers.get('x-worker-age-basis') ?? 0);
    const ageSeconds = (Date.now() - basis) / 1000;

    if (ageSeconds < route.ttl) {
      return withHeaders(cached, cors, 'HIT', route.ttl);
    }

    // Past TTL: serve it now, refresh behind the request, so a cache expiry
    // never makes a user wait on the upstream round-trip. Single-flighted, so
    // the whole readership arriving inside one expired window costs one
    // upstream call rather than one each.
    // A refusal here must not replace the body being served.
    ctx.waitUntil(fetchAndStore(cacheKey, route, params, cache, ctx, false));
    return withHeaders(cached, cors, 'STALE', route.ttl);
  }

  // A cold miss is single-flighted too, and for the same reason: without it,
  // every reader arriving before the first body lands goes upstream
  // separately. Joining callers get the same outcome, upstream status included.
  const outcome = await fetchAndStore(cacheKey, route, params, cache, ctx, true);
  if (!outcome.ok) return upstreamError(outcome.status, cors);

  return withHeaders(responseFrom(outcome.stored), cors, 'MISS', route.ttl);
}

/** /mapping with the names this isolate already holds answered from memory (see names.ts). */
async function serveMapping(
  route: RouteDef,
  params: Record<string, ParamValue>,
  cors: Headers,
  ctx: ExecutionContext
): Promise<Response> {
  const { held, rest } = splitKnown(params);
  const shape = SHAPES[route.match] ?? ((v: unknown) => v);
  if (!rest) {
    const body = JSON.stringify(shape(held));
    return withHeaders(new Response(body, { headers: { 'Content-Type': 'application/json' } }), cors, 'MEMORY', route.ttl);
  }

  const res = await serve(route, rest, cors, ctx);
  if (!res.ok) return res;

  const text = await res.text();
  const headers = new Headers(res.headers);
  headers.delete('Content-Length');
  let fetched: Partial<Mapping>;
  try {
    fetched = JSON.parse(text) as Partial<Mapping>;
  } catch {
    // Not the shape we know: hand it on as the upstream sent it.
    return new Response(text, { status: res.status, headers });
  }

  remember(rest, fetched);
  return new Response(JSON.stringify(shape(merge(held, fetched))), { status: 200, headers });
}

/** A caller's own Response over a shared, already-read body. */
function responseFrom(stored: StoredBody): Response {
  return new Response(stored.body, {
    status: 200,
    headers: { 'Content-Type': stored.contentType },
  });
}

/**
 * Fetch upstream and cache the result, once at a time per key. Held as bytes because joining
 * callers each need their own Response. Never rejects, so a failure frees the in-flight slot.
 */
function fetchAndStore(
  cacheKey: Request,
  route: RouteDef,
  params: Record<string, ParamValue>,
  cache: Cache,
  ctx: ExecutionContext,
  holdRefusal: boolean
): Promise<FetchOutcome> {
  const open = inFlight.get(cacheKey.url);
  if (open) return open;

  const work = (async (): Promise<FetchOutcome> => {
    try {
      const fresh = await fetchUpstream(route, params);

      if (!fresh.ok) {
        // The upstream's own words go to the log, never to the caller.
        const detail = await fresh.text().catch(() => '');
        console.warn('upstream error', { route: route.match, status: fresh.status, detail: detail.slice(0, 300) });
        if (holdRefusal && isRefusal(fresh.status)) ctx.waitUntil(cache.put(cacheKey, refusal(fresh.status)));
        return { ok: false, status: fresh.status };
      }

      return { ok: true, stored: await store(cacheKey, fresh, route, cache, ctx) };
    } catch (err) {
      // status 0 is "never got a reply", which is a 502 rather than a passthrough.
      const timedOut = err instanceof Error && err.name === 'TimeoutError';
      const detail = timedOut ? `No reply within ${UPSTREAM_TIMEOUT_MS / 1000}s` : String(err);
      console.warn('upstream unreachable', { route: route.match, detail });
      return { ok: false, status: 0 };
    }
  })();

  // The fetch's own timeout doesn't bound every await after it (a body that never finishes
  // reading was seen on live matches, 2026-10-21), and a run that never settles keeps its key
  // in `inFlight`, so every later request for that key hangs too. This one always settles.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<FetchOutcome>((resolve) => {
    timer = setTimeout(() => {
      console.warn('upstream unsettled', { route: route.match });
      resolve({ ok: false, status: 0 });
    }, RUN_DEADLINE_MS);
  });
  const run = Promise.race([work, deadline]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
    inFlight.delete(cacheKey.url);
  });

  inFlight.set(cacheKey.url, run);
  return run;
}

/**
 * Store a body under `cacheKey`, stamping the time it was fetched so TTL is
 * computed from our own clock rather than upstream's Cache-Control. The route's
 * shape is applied first, so the cache holds what callers are sent.
 */
async function store(
  cacheKey: Request,
  response: Response,
  route: RouteDef,
  cache: Cache,
  ctx: ExecutionContext
): Promise<StoredBody> {
  const raw = await response.arrayBuffer();
  const contentType = response.headers.get('Content-Type') ?? 'application/json';
  const ttl = route.ttl;
  // /mapping is shaped after its merge with the names held in memory (serveMapping).
  const body = route.match === '/mapping' ? raw : shapeBody(raw, SHAPES[route.match]);

  const headers = new Headers({
    'Content-Type': contentType,
    'x-worker-age-basis': String(Date.now()),
    // Keep the entry alive past its TTL so the stale-on-error path has
    // something to fall back to.
    'Cache-Control': `public, max-age=${ttl + STALE_GRACE_SECONDS}`,
  });

  ctx.waitUntil(cache.put(cacheKey, new Response(body, { status: 200, headers })));

  return { body, contentType };
}

/** The body with its route's shape applied; one that isn't JSON is passed on as sent. */
function shapeBody(raw: ArrayBuffer, shape: ((value: unknown) => unknown) | undefined): ArrayBuffer {
  if (!shape) return raw;
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(raw));
    return new TextEncoder().encode(JSON.stringify(shape(parsed))).buffer as ArrayBuffer;
  } catch {
    return raw;
  }
}

function withHeaders(response: Response, cors: Headers, status: string, ttl: number): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of cors) headers.set(k, v);
  headers.set('X-Worker-Cache', status);
  headers.delete('x-worker-age-basis');
  headers.set('Cache-Control', `public, max-age=${Math.min(ttl, 30)}`);
  return new Response(response.body, { status: 200, headers });
}

/** The caller's view of a failed upstream call: its status (which the frontend reads), nothing else. `0` never landed. */
function upstreamError(status: number, cors: Headers): Response {
  if (status === 0) return json({ error: 'Upstream unreachable' }, 502, cors);
  return json({ error: 'Upstream error', status }, status === 429 ? 429 : 502, cors);
}

// Only these mean the key is wrong; 401/403 (a block), 408, 429 and 5xx are outages and never held.
const isRefusal = (status: number) => status === 400 || status === 404;

function refusal(status: number): Response {
  return new Response(null, {
    status: 200,
    headers: { [REFUSAL_HEADER]: String(status), 'Cache-Control': `public, max-age=${REFUSAL_TTL_SECONDS}` },
  });
}

const LOCAL_HOST = /^(localhost|127\.0\.0\.1)$/;
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function originAllowed(origin: string, env: Env, self: URL): boolean {
  if (allowedOrigins(env).includes(origin)) return true;
  // A Worker answering on localhost is `wrangler dev`, and so are its callers.
  return LOCAL_HOST.test(self.hostname) && LOCAL_ORIGIN.test(origin);
}

function allowedOrigins(env: Env): string[] {
  return (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

function corsHeaders(request: Request, env: Env, self: URL): Headers {
  const origin = request.headers.get('Origin') ?? '';

  const headers = new Headers({
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  });

  // Echo the origin only when it's on the list. Server-side callers (Next.js
  // SSR) send no Origin and are unaffected by CORS.
  if (origin && originAllowed(origin, env, self)) {
    headers.set('Access-Control-Allow-Origin', origin);
  }

  return headers;
}

function json(body: unknown, status: number, cors: Headers): Response {
  const headers = new Headers(cors);
  headers.set('Content-Type', 'application/json');
  headers.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(body), { status, headers });
}
