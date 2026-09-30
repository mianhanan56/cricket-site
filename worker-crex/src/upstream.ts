import { UPSTREAMS } from './upstreams';
import { canonicalQuery, type ParamValue, type RouteDef } from './routes';

// crex's live list has hung rather than failed. Without a ceiling the call never
// settles, and every request joined to it in `inFlight` hangs with it. Kept under
// the frontend's own 15s so the caller gets this Worker's 502, not its own abort.
export const UPSTREAM_TIMEOUT_MS = 10_000;

export function fetchUpstream(route: RouteDef, params: Record<string, ParamValue>): Promise<Response> {
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
    return fetch(`${base}${route.path}${query ? `?${query}` : ''}`, {
      headers,
      cf,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  }

  headers['Content-Type'] = 'application/json';
  return fetch(`${base}${route.path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...route.bodyDefaults, ...(route.buildBody ? route.buildBody(params) : params) }),
    cf,
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
}
