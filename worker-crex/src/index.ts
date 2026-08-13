// Edge proxy in front of crex.com's internal APIs.
//
// Same three jobs as the CricLive Worker in ../worker: collapse traffic with an
// edge cache, emit CORS your origins need, and serve stale data rather than an
// error when upstream hiccups. Two differences specific to crex:
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
import {
  canonicalQuery,
  matchRoute,
  ParamError,
  readParams,
  ROUTES,
  type ParamValue,
  type RouteDef,
} from './routes';

export interface Env {
  ALLOWED_ORIGINS: string;
}

// How long past its TTL a cached body may still be served when upstream fails.
// Stale scores beat a broken page.
const STALE_GRACE_SECONDS = 300;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return json({ error: 'Method not allowed' }, 405, cors);
    }

    if (url.pathname === '/' || url.pathname === '/health') {
      return json(
        {
          status: 'ok',
          worker: 'pulsecrease-crex',
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
    const query = canonicalQuery(params);
    const cacheKey = new Request(
      `${UPSTREAMS[route.base]}${route.path}${query ? `?${query}` : ''}`,
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
      // never makes a user wait on the upstream round-trip.
      ctx.waitUntil(refresh(cacheKey, route, params, cache));
      return withHeaders(cached, cors, 'STALE', route.ttl);
    }

    try {
      const fresh = await fetchUpstream(route, params);

      if (!fresh.ok) {
        const body = await fresh.text();
        return json(
          {
            error: 'Upstream error',
            status: fresh.status,
            upstream: `${route.method} ${UPSTREAMS[route.base]}${route.path}`,
            detail: body.slice(0, 500),
          },
          fresh.status === 429 ? 429 : 502,
          cors
        );
      }

      const stored = await store(cacheKey, fresh, route.ttl, cache, ctx);
      return withHeaders(stored, cors, 'MISS', route.ttl);
    } catch (err) {
      return json({ error: 'Upstream unreachable', detail: String(err) }, 502, cors);
    }
  },
} satisfies ExportedHandler<Env>;

function fetchUpstream(route: RouteDef, params: Record<string, ParamValue>): Promise<Response> {
  const base = UPSTREAMS[route.base];

  // crex's hosts 400 with "Invalid Host header" unless the request presents as
  // one of their own pages. These are the headers their site already sends.
  const headers: Record<string, string> = {
    Accept: 'application/json',
    Origin: 'https://crex.com',
    Referer: 'https://crex.com/',
    'User-Agent': 'Mozilla/5.0 (compatible; PulseCrease-Worker/1.0)',
    ...route.headers,
  };

  // Don't let Cloudflare's own fetch cache shadow ours — we manage TTLs here.
  const cf = { cacheTtl: 0, cacheEverything: false };

  if (route.method === 'GET') {
    const query = canonicalQuery(params);
    return fetch(`${base}${route.path}${query ? `?${query}` : ''}`, { headers, cf });
  }

  headers['Content-Type'] = 'application/json';
  return fetch(`${base}${route.path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...route.bodyDefaults, ...(route.buildBody ? route.buildBody(params) : params) }),
    cf,
  });
}

/**
 * Store a response under `cacheKey`, stamping the time it was fetched so TTL is
 * computed from our own clock rather than upstream's Cache-Control.
 */
async function store(
  cacheKey: Request,
  response: Response,
  ttl: number,
  cache: Cache,
  ctx?: ExecutionContext
): Promise<Response> {
  const body = await response.arrayBuffer();

  const headers = new Headers({
    'Content-Type': response.headers.get('Content-Type') ?? 'application/json',
    'x-worker-age-basis': String(Date.now()),
    // Keep the entry alive past its TTL so the stale-on-error path has
    // something to fall back to.
    'Cache-Control': `public, max-age=${ttl + STALE_GRACE_SECONDS}`,
  });

  const toCache = new Response(body, { status: 200, headers });
  const write = cache.put(cacheKey, toCache.clone());
  if (ctx) ctx.waitUntil(write);
  else await write;

  return toCache;
}

/** Background revalidation. Failures are swallowed — the stale entry stands. */
async function refresh(
  cacheKey: Request,
  route: RouteDef,
  params: Record<string, ParamValue>,
  cache: Cache
): Promise<void> {
  try {
    const fresh = await fetchUpstream(route, params);
    if (fresh.ok) await store(cacheKey, fresh, route.ttl, cache);
  } catch {
    // Ignore: the caller already got a usable stale response.
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

function corsHeaders(request: Request, env: Env): Headers {
  const origin = request.headers.get('Origin') ?? '';
  const allowed = (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  const headers = new Headers({
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  });

  // Echo the origin only when it's on the list. Server-side callers (Next.js
  // SSR, the backend) send no Origin and are unaffected by CORS.
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
