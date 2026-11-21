import { UPSTREAMS } from './upstreams';
import { upstreamTarget, type ParamValue, type RouteDef } from './routes';

// The upstream's live list has hung rather than failed. Without a ceiling the call never
// settles, and every request joined to it in `inFlight` hangs with it. Kept under
// the frontend's own 15s so the caller gets this Worker's 502, not its own abort.
export const UPSTREAM_TIMEOUT_MS = 10_000;

/** The upstream's own site, which every call presents as. */
export const UPSTREAM_SITE = 'https://crex.com';

export function fetchUpstream(route: RouteDef, params: Record<string, ParamValue>, stop?: AbortSignal): Promise<Response> {
  const base = UPSTREAMS[route.base];
  const { path, query } = upstreamTarget(route, params);

  // The upstream's hosts 400 with "Invalid Host header" unless the request presents as
  // one of their own pages. These are the headers their site already sends.
  const headers: Record<string, string> = {
    Accept: 'application/json',
    Origin: UPSTREAM_SITE,
    Referer: `${UPSTREAM_SITE}/`,
    'User-Agent': 'Mozilla/5.0 (compatible; PulseCrease-Worker/1.0)',
    ...route.headers,
  };

  // Don't let Cloudflare's own fetch cache shadow ours — we manage TTLs here.
  const cf = { cacheTtl: 0, cacheEverything: false };
  const timeout = AbortSignal.timeout(UPSTREAM_TIMEOUT_MS);
  const signal = stop ? AbortSignal.any([timeout, stop]) : timeout;

  if (route.method === 'GET') {
    return fetch(`${base}${path}${query ? `?${query}` : ''}`, {
      headers,
      cf,
      signal,
    });
  }

  headers['Content-Type'] = 'application/json';
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...route.bodyDefaults, ...(route.buildBody ? route.buildBody(params) : params) }),
    cf,
    signal,
  });
}

// The fetch's own timeout has been seen not to end a body read that stalled (2026-10-21).
export const READ_DEADLINE_MS = UPSTREAM_TIMEOUT_MS + 2_000;

/**
 * One upstream body as JSON, rejecting on a non-2xx or when it isn't all read by `READ_DEADLINE_MS`.
 * A read past the deadline is aborted, so it doesn't keep holding one of the invocation's connections.
 */
export function readUpstreamJson(route: RouteDef, params: Record<string, ParamValue>): Promise<unknown> {
  const stop = new AbortController();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      stop.abort();
      reject(new Error('upstream unsettled'));
    }, READ_DEADLINE_MS);
  });
  const read = (async () => {
    const res = await fetchUpstream(route, params, stop.signal);
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    return (await res.json()) as unknown;
  })();
  return Promise.race([read, deadline]).finally(() => {
    if (timer !== null) clearTimeout(timer);
  });
}
