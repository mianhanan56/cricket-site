// Allowlist of crex endpoints this Worker exposes.
//
// Two things shape this file:
//
// 1. Most crex endpoints are POST with a JSON body, which is awkward to cache
//    and awkward to call. Every route here presents a plain GET with query
//    params to the caller; the Worker translates to whatever the upstream
//    actually wants. So `/rankings?category=0&gender=0` on the Worker becomes
//    `POST /ranking/rankingFront {"category":0,"gender":0,"play":0}` upstream.
//
// 2. Params are declared, typed and bounded. A blind pass-through would make
//    this Worker an open relay into crex's API from any origin — the allowlist
//    plus `params` is what keeps it to the calls your app actually makes.
//
// Verify a new endpoint with ./scripts/probe.sh before adding it here.

import type { UpstreamName } from './upstreams';

export interface ParamSpec {
  /** `list` accepts a comma-separated string and sends a JSON array upstream. */
  type: 'int' | 'string' | 'list';
  /** Permitted values. Anything else is rejected with a 400. */
  enum?: readonly (string | number)[];
  /** Applied when the caller omits the param. */
  default?: string | number;
  /** Reject the request when absent and there is no default. */
  required?: boolean;
  /** `list` only: cap on how many keys one call may resolve. */
  maxItems?: number;
}

export interface RouteDef {
  /** Path on this Worker. */
  match: string;
  /** Which host in UPSTREAMS serves it. */
  base: UpstreamName;
  /** Path appended to the upstream base. */
  path: string;
  /** How the upstream wants to be called. */
  method: 'GET' | 'POST';
  /** Edge cache lifetime in seconds. */
  ttl: number;
  /** Query params accepted from the caller, in upstream's own vocabulary. */
  params?: Record<string, ParamSpec>;
  /** Constant fields merged into the POST body alongside the params. */
  bodyDefaults?: Record<string, unknown>;
  /** Extra request headers upstream requires. */
  headers?: Record<string, string>;
  /** One-line note surfaced by /health. */
  note?: string;
}

export const ROUTES: RouteDef[] = [
  {
    // The whole live/upcoming/recent match list in one payload. Keys are
    // single letters (see README) — this is crex's own wire format, passed
    // through unchanged rather than normalized here.
    match: '/matches/live',
    base: 'php',
    path: '/getLiveMatches',
    method: 'GET',
    // 5s, matched to the frontend poll interval. These two numbers must move
    // together — a longer TTL here caps freshness no matter how often the
    // client asks. Still collapses traffic hard: any number of viewers cost at
    // most 12 upstream calls a minute between them.
    ttl: 5,
    note: 'All matches; obfuscated single-letter keys',
  },
  {
    // Team rankings for the homepage widget. Numeric enums, not strings:
    // category 0=test 1=odi 2=t20, gender 0=men 1=women, play 0=team.
    match: '/rankings',
    base: 'oc',
    path: '/ranking/rankingFront',
    method: 'POST',
    ttl: 3600,
    params: {
      category: { type: 'int', enum: [0, 1, 2], default: 0 },
      gender: { type: 'int', enum: [0, 1], default: 0 },
      play: { type: 'int', enum: [0, 1, 2], default: 0 },
    },
    note: 'category 0=test 1=odi 2=t20; gender 0=men 1=women',
  },
  {
    // Resolves the opaque keys the other payloads are built from — `"b":"11"`
    // is a team, `"v":"BK"` a venue, `"q":"1JK"` a series. Nothing from
    // /matches/live is renderable without this.
    //
    // It is a lookup by key, not a dump: you send the keys you saw and get back
    // only those. An empty request returns empty arrays, which is what made
    // this look broken before. crex also gates it behind a `type` header.
    match: '/mapping',
    base: 'oc',
    path: '/mapping/getHomeMapData',
    method: 'POST',
    ttl: 21600,
    params: {
      t: { type: 'list', maxItems: 200 }, // teams
      v: { type: 'list', maxItems: 200 }, // venues
      s: { type: 'list', maxItems: 200 }, // series
      p: { type: 'list', maxItems: 200 }, // players
      u: { type: 'list', maxItems: 200 }, // umpires
    },
    bodyDefaults: { lc: 'en' },
    headers: { type: 'home' },
    note: 'Key lookup: /mapping?t=11,70&v=BK&s=1JK — comma-separated f_keys',
  },
  {
    // Per-innings scorecard, keyed by match. Response is two objects ("0", "1")
    // of packed strings — see frontend/lib/crex.ts for the decode.
    match: '/match/scorecard',
    base: 'php',
    path: '/getSC4',
    method: 'GET',
    ttl: 5,
    params: {
      key: { type: 'string', required: true },
    },
    note: 'Batting card + partnerships + extras, packed dot-delimited',
  },
  {
    // Ball-by-ball. Unlike the rest of crex's live data this one is plain text
    // over HTTP — `c1` is the headline, `c2` the description — so it needs no
    // decoding and no Firebase.
    //
    // Returns only the most recent ~10 balls; `lastDocId` pages further back
    // but is not exposed here since the UI only shows the live tail.
    match: '/match/commentary',
    base: 'oc',
    path: '/commentary/getBallFeeds',
    method: 'POST',
    ttl: 5,
    params: {
      matchKey: { type: 'string', required: true },
    },
    bodyDefaults: { lastDocId: '', filters: {} },
    note: 'Latest ~10 balls with commentary text',
  },
  {
    match: '/news/topics',
    base: 'news',
    path: '/api/articlesOC/topics',
    method: 'GET',
    ttl: 900,
    params: {
      page: { type: 'int', default: 1 },
    },
  },
];

export type ParamValue = string | number | string[];

/** Thrown for a param that fails its spec. Surfaces as a 400, not a 502. */
export class ParamError extends Error {}

export function matchRoute(pathname: string): RouteDef | null {
  const normalized = '/' + pathname.split('/').filter(Boolean).join('/');
  return ROUTES.find((r) => r.match === normalized) ?? null;
}

/**
 * Validate the caller's query string against `route.params`.
 *
 * Unknown params are dropped rather than rejected — a stray `utm_source` from
 * a browser referrer should not 400 the request, and dropping keeps the cache
 * key stable across callers that decorate their URLs.
 */
export function readParams(route: RouteDef, search: URLSearchParams): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = {};

  for (const [name, spec] of Object.entries(route.params ?? {})) {
    const raw = search.get(name);

    if (raw === null) {
      // A `list` param always goes upstream, empty if unasked-for: crex expects
      // every bucket present in the body, not just the populated ones.
      if (spec.type === 'list') out[name] = [];
      else if (spec.default !== undefined) out[name] = spec.default;
      else if (spec.required) throw new ParamError(`Missing required param '${name}'`);
      continue;
    }

    if (spec.type === 'list') {
      const items = [...new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))].sort();
      const cap = spec.maxItems ?? 100;
      if (items.length > cap) {
        throw new ParamError(`Param '${name}' accepts at most ${cap} keys, got ${items.length}`);
      }
      out[name] = items;
      continue;
    }

    let value: string | number = raw;
    if (spec.type === 'int') {
      const n = Number(raw);
      if (!Number.isInteger(n)) throw new ParamError(`Param '${name}' must be an integer, got '${raw}'`);
      value = n;
    }

    if (spec.enum && !spec.enum.includes(value)) {
      throw new ParamError(`Param '${name}' must be one of ${spec.enum.join(', ')}, got '${raw}'`);
    }

    out[name] = value;
  }

  return out;
}

/**
 * Canonical (key-sorted) rendering of the params, used both for the upstream
 * query string and for the cache key. Sorting is what makes `?a=1&b=2` and
 * `?b=2&a=1` a single cache entry instead of two.
 */
export function canonicalQuery(params: Record<string, ParamValue>): string {
  const qs = new URLSearchParams();
  for (const key of Object.keys(params).sort()) {
    const value = params[key];
    // List items were already deduped and sorted in readParams, so two callers
    // asking for the same keys in a different order share one cache entry.
    if (Array.isArray(value)) {
      if (value.length) qs.set(key, value.join(','));
    } else {
      qs.set(key, String(value));
    }
  }
  return qs.toString();
}
