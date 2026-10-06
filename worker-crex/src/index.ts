// Edge proxy in front of crex.com's internal APIs: collapse traffic with an
// edge cache, emit the CORS our origins need, and serve stale data rather than
// an error when upstream hiccups.
//
//   - Upstream is five hosts, not one (see upstreams.ts), and most endpoints
//     are POST. Callers here always use GET; the translation happens below.
//   - crex's hosts reject requests that do not look like they came from their
//     own site, so every upstream call carries an Origin/Referer of crex.com.
//     That is the header their servers already expect from a browser on their
//     site — it is not a bypass of any challenge or bot check. If crex adds
//     real bot protection, this Worker will start failing, and the fix is to
//     ask them for API access, not to defeat it.
//
// Routes are allowlisted in routes.ts. Anything else is a 404.

import { UPSTREAMS } from './upstreams';
import { fetchUpstream, UPSTREAM_TIMEOUT_MS } from './upstream';
import {
  matchRoute,
  ParamError,
  readParams,
  ROUTES,
  upstreamTarget,
  type ParamValue,
  type RouteDef,
} from './routes';

export { LiveHub } from './live';

export interface Env {
  ALLOWED_ORIGINS: string;
  LIVE_HUB: DurableObjectNamespace;
}

// How long past its TTL a cached body may still be served when upstream fails.
// Stale scores beat a broken page.
const STALE_GRACE_SECONDS = 300;


/**
 * Upstream calls this isolate currently has open, keyed by the cache key.
 *
 * Without it, the cache collapses traffic only once a body has LANDED — and the
 * moment an entry goes stale, every request arriving in that window starts its
 * own refresh. On /matches/live, whose TTL is two seconds, that is the whole
 * readership fanning out to crex at once, which is the exact thing the edge
 * cache exists to prevent. The first request through starts the call; the rest
 * join it.
 *
 * Isolate-local, so a colo with several isolates makes a few calls rather than
 * one. That is the practical bound on a Worker and still orders of magnitude
 * below one per reader.
 */
const inFlight = new Map<string, Promise<FetchOutcome>>();

/** A fetched body, held as bytes so every joining caller can build its own Response. */
interface StoredBody {
  body: ArrayBuffer;
  contentType: string;
}

/** What one upstream attempt produced. `status: 0` means the call never landed. */
type FetchOutcome =
  | { ok: true; stored: StoredBody }
  | { ok: false; status: number; detail: string };

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    // WebSockets skip CORS, so the origin allowlist is enforced here by hand.
    if (url.pathname === '/live') {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
        return json({ error: 'Expected a WebSocket upgrade' }, 426, cors);
      }
      const origin = request.headers.get('Origin');
      if (origin && !allowedOrigins(env).includes(origin)) {
        return json({ error: 'Origin not allowed' }, 403, cors);
      }
      return env.LIVE_HUB.get(env.LIVE_HUB.idFromName('live')).fetch(request);
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return json({ error: 'Method not allowed' }, 405, cors);
    }

    if (url.pathname === '/' || url.pathname === '/health') {
      return json(
        {
          status: 'ok',
          worker: 'pulsecrease-crex',
          live: { path: '/live', topics: ['matches', 'card:<matchKey>', 'feed:<matchKey>'] },
          upstreams: UPSTREAMS,
          routes: ROUTES.map((r) => ({
            path: r.match,
            upstream: `${r.method} ${UPSTREAMS[r.base]}${r.path}`,
            ttl: r.ttl,
            params: r.params ? Object.keys(r.params) : [],
            note: r.note,
          })),
        },
        200,
        cors
      );
    }

    const route = matchRoute(url.pathname);
    if (!route) {
      return json({ error: `No route for ${url.pathname}`, routes: ROUTES.map((r) => r.match) }, 404, cors);
    }

    let params: Record<string, ParamValue>;
    try {
      params = readParams(route, url.searchParams);
    } catch (err) {
      if (err instanceof ParamError) return json({ error: err.message, path: url.pathname }, 400, cors);
      throw err;
    }

    // Cache key is derived from the upstream call, not the caller's URL, so
    // every origin shares one entry and client-side noise cannot fragment it.
    // The Cache API only stores GET, so a POST upstream is keyed by a synthetic
    // GET URL carrying the canonical params.
    const { path, query } = upstreamTarget(route, params);
    const cacheKey = new Request(
      `${UPSTREAMS[route.base]}${path}${query ? `?${query}` : ''}`,
      { method: 'GET' }
    );
    const cache = caches.default;

    const cached = await cache.match(cacheKey);
    if (cached) {
      const basis = Number(cached.headers.get('x-worker-age-basis') ?? 0);
      const ageSeconds = (Date.now() - basis) / 1000;

      if (ageSeconds < route.ttl) {
        return withHeaders(cached, cors, 'HIT', route.ttl);
      }

      // Past TTL: serve it now, refresh behind the request, so a cache expiry
      // never makes a user wait on the upstream round-trip. Single-flighted, so
      // the whole readership arriving inside one expired window costs one
      // upstream call rather than one each.
      ctx.waitUntil(fetchAndStore(cacheKey, route, params, cache, ctx));
      return withHeaders(cached, cors, 'STALE', route.ttl);
    }

    // A cold miss is single-flighted too, and for the same reason: without it,
    // every reader arriving before the first body lands goes upstream
    // separately. Joining callers get the same outcome — including the same
    // upstream error, so a failure still reports what actually went wrong
    // rather than a generic 502.
    const outcome = await fetchAndStore(cacheKey, route, params, cache, ctx);

    if (!outcome.ok) {
      return outcome.status === 0
        ? json({ error: 'Upstream unreachable', detail: outcome.detail }, 502, cors)
        : json(
            {
              error: 'Upstream error',
              status: outcome.status,
              upstream: `${route.method} ${UPSTREAMS[route.base]}${path}`,
              detail: outcome.detail,
            },
            outcome.status === 429 ? 429 : 502,
            cors
          );
    }

    return withHeaders(responseFrom(outcome.stored), cors, 'MISS', route.ttl);
  },
} satisfies ExportedHandler<Env>;

/** A caller's own Response over a shared, already-read body. */
function responseFrom(stored: StoredBody): Response {
  return new Response(stored.body, {
    status: 200,
    headers: { 'Content-Type': stored.contentType },
  });
}

/**
 * Fetch upstream and write the result to the cache — at most once at a time per
 * cache key, however many requests want it.
 *
 * The result is held as bytes rather than as a Response because a Response body
 * can only be read once: joining callers each need their own, so what is shared
 * is the ArrayBuffer they build it from.
 *
 * Never rejects. An upstream failure resolves to a described outcome so every
 * joined caller can report it identically, and so a failure clears the in-flight
 * slot rather than wedging the key.
 */
function fetchAndStore(
  cacheKey: Request,
  route: RouteDef,
  params: Record<string, ParamValue>,
  cache: Cache,
  ctx: ExecutionContext
): Promise<FetchOutcome> {
  const open = inFlight.get(cacheKey.url);
  if (open) return open;

  const run = (async (): Promise<FetchOutcome> => {
    try {
      const fresh = await fetchUpstream(route, params);

      if (!fresh.ok) {
        const detail = await fresh.text().catch(() => '');
        console.warn('upstream error', { route: route.match, status: fresh.status });
        return { ok: false, status: fresh.status, detail: detail.slice(0, 500) };
      }

      return { ok: true, stored: await store(cacheKey, fresh, route.ttl, cache, ctx) };
    } catch (err) {
      // status 0 is "never got a reply", which is a 502 rather than a passthrough.
      const timedOut = err instanceof Error && err.name === 'TimeoutError';
      const detail = timedOut ? `No reply within ${UPSTREAM_TIMEOUT_MS / 1000}s` : String(err);
      console.warn('upstream unreachable', { route: route.match, detail });
      return { ok: false, status: 0, detail };
    }
  })().finally(() => inFlight.delete(cacheKey.url));

  inFlight.set(cacheKey.url, run);
  return run;
}

/**
 * Store a body under `cacheKey`, stamping the time it was fetched so TTL is
 * computed from our own clock rather than upstream's Cache-Control.
 */
async function store(
  cacheKey: Request,
  response: Response,
  ttl: number,
  cache: Cache,
  ctx: ExecutionContext
): Promise<StoredBody> {
  const body = await response.arrayBuffer();
  const contentType = response.headers.get('Content-Type') ?? 'application/json';

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

function withHeaders(response: Response, cors: Headers, status: string, ttl: number): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of cors) headers.set(k, v);
  headers.set('X-Worker-Cache', status);
  headers.delete('x-worker-age-basis');
  headers.set('Cache-Control', `public, max-age=${Math.min(ttl, 30)}`);
  return new Response(response.body, { status: 200, headers });
}

function allowedOrigins(env: Env): string[] {
  return (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

function corsHeaders(request: Request, env: Env): Headers {
  const origin = request.headers.get('Origin') ?? '';
  const allowed = allowedOrigins(env);

  const headers = new Headers({
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  });

  // Echo the origin only when it's on the list. Server-side callers (Next.js
  // SSR) send no Origin and are unaffected by CORS.
  if (origin && allowed.includes(origin)) {
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
