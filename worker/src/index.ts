// Edge proxy in front of CricLive API (cricketliveapi.com).
//
// Three jobs:
//   1. Keep the API key server-side — the browser never sees it.
//   2. Collapse traffic with an edge cache, so 10k viewers of a live match cost
//      ~6 upstream calls a minute instead of 10k.
//   3. Serve CORS headers your allowed origins need, and stale data rather than
//      an error when upstream hiccups.
//
// Routes are allowlisted in routes.ts.

import { matchRoute, ROUTES, type RouteDef } from './routes';

export interface Env {
  /** Bearer token from the CricLive dashboard. Only protected routes need it. */
  CRICKET_API_TOKEN: string;
  UPSTREAM_BASE: string;
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

    // Health + route listing, useful for smoke-testing a deploy. `tokenPresent`
    // tells you at a glance whether the protected routes can work.
    if (url.pathname === '/' || url.pathname === '/health') {
      return json(
        {
          status: 'ok',
          worker: 'pulsecrease-cricket',
          upstream: env.UPSTREAM_BASE,
          tokenPresent: Boolean(env.CRICKET_API_TOKEN),
          routes: ROUTES.map((r) => ({
            path: r.match,
            auth: r.auth ?? 'public',
            ttl: r.ttl,
          })),
        },
        200,
        cors
      );
    }

    const matched = matchRoute(url.pathname);
    if (!matched) {
      return json({ error: `No route for ${url.pathname}`, routes: ROUTES.map((r) => r.match) }, 404, cors);
    }

    const { route, upstreamPath } = matched;

    // Only the subscription-gated routes need a token; the rest are public, so a
    // missing token must not take the whole Worker down.
    if (route.auth === 'token' && !env.CRICKET_API_TOKEN) {
      return json(
        {
          error: 'This endpoint needs a CricLive token',
          detail: 'Set it with: npx wrangler secret put CRICKET_API_TOKEN',
          path: url.pathname,
        },
        503,
        cors
      );
    }

    const upstream = new URL(env.UPSTREAM_BASE.replace(/\/$/, '') + upstreamPath);

    // Cache key is the upstream URL — one entry per distinct upstream request,
    // shared across all callers and origins. Never the client's URL, which
    // could carry origin-specific noise.
    const cacheKey = new Request(upstream.toString(), { method: 'GET' });
    const cache = caches.default;

    const cached = await cache.match(cacheKey);
    if (cached) {
      const age = Number(cached.headers.get('x-worker-age-basis') ?? 0);
      const ageSeconds = (Date.now() - age) / 1000;

      if (ageSeconds < route.ttl) {
        return withHeaders(cached, cors, 'HIT', route.ttl);
      }

      // Past TTL: serve it immediately and refresh behind the request, so a
      // cache expiry never makes a user wait on the upstream round-trip.
      ctx.waitUntil(refresh(cacheKey, upstream, env, route, cache));
      return withHeaders(cached, cors, 'STALE', route.ttl);
    }

    // Cold cache — fetch inline.
    try {
      const fresh = await fetchUpstream(upstream, env, route);

      if (!fresh.ok) {
        const body = await fresh.text();

        // 401 on a protected route means the token is missing/expired or the
        // subscription lapsed — say so, rather than a bare "upstream error".
        if (fresh.status === 401) {
          return json(
            {
              error: 'CricLive rejected the token',
              detail: 'Token expired/regenerated, or the subscription is inactive.',
              path: url.pathname,
            },
            502,
            cors
          );
        }

        return json(
          { error: 'Upstream error', status: fresh.status, detail: body.slice(0, 500) },
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

function fetchUpstream(upstream: URL, env: Env, route: RouteDef): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': 'PulseCrease-Worker/1.0',
  };

  // CricLive uses a Bearer token (Laravel Sanctum), and only on the
  // subscription-gated routes. Sending it to public routes would be harmless but
  // pointless, so keep it scoped.
  if (route.auth === 'token' && env.CRICKET_API_TOKEN) {
    headers.Authorization = `Bearer ${env.CRICKET_API_TOKEN}`;
  }

  return fetch(upstream.toString(), {
    headers,
    // Don't let Cloudflare's own fetch cache shadow ours — we manage TTLs here.
    cf: { cacheTtl: 0, cacheEverything: false },
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
async function refresh(cacheKey: Request, upstream: URL, env: Env, route: RouteDef, cache: Cache) {
  try {
    const fresh = await fetchUpstream(upstream, env, route);
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
  // Let the browser and any CDN in front of the Worker cache it too.
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
  // SSR, the Express backend) send no Origin and are unaffected by CORS.
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
