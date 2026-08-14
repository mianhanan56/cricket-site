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
  /** `int` only: inclusive bounds, for params that are a range rather than a set. */
  min?: number;
  max?: number;
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
  /**
   * Reshape the validated params into the body upstream wants, for endpoints
   * whose payload is not flat. Return value is merged over `bodyDefaults`; the
   * cache key is still derived from the params, not from this.
   */
  buildBody?: (params: Record<string, ParamValue>) => Record<string, unknown>;
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
    note: 'Batting (b) + bowling (a) + partnerships + extras, packed dot-delimited',
  },
  {
    // Ball-by-ball. Unlike the rest of crex's live data this one is plain text
    // over HTTP — `c1` is the headline, `c2` the description — so it needs no
    // decoding and no Firebase.
    //
    // Returns only the most recent ~10 events per call. `lastDocId` is the
    // cursor: pass the `id` (epoch ms) of the last entry you received and the
    // next page comes back older-still. Omit it for the live tail.
    //
    // Exposed because ~10 events is under two overs once over-summaries and
    // milestone markers are counted out, and the header's recent-balls strip
    // needs three overs of actual deliveries.
    match: '/match/commentary',
    base: 'oc',
    path: '/commentary/getBallFeeds',
    method: 'POST',
    ttl: 5,
    params: {
      matchKey: { type: 'string', required: true },
      lastDocId: { type: 'string', default: '' },
    },
    bodyDefaults: { filters: {} },
    note: 'Latest ~10 balls; lastDocId=<id of last entry> pages backwards',
  },
  {
    // Player rankings — one list per format/gender/discipline.
    //
    // Unlike the team-rankings endpoint above, this one takes *string* params,
    // which is what made it look broken for so long: `category` selects player
    // vs team, and `play` is the discipline. Sending `category=batting` (the
    // obvious reading) gets you "category.toLowerCase is not a function" or a
    // silent empty body. The names below come from crex's own rankings chunk,
    // where the request object is built as
    // `{category, gender, type, play, page}`.
    //
    // The response is keyed, not named: `pf` is a player f_key, `tf` a team's,
    // `r` the rating, `pos` the position and `pr` the previous position (which
    // is how their UI draws the up/down arrow). Resolve pf/tf through /mapping.
    match: '/rankings/players',
    base: 'oc',
    path: '/ranking/getRanking',
    method: 'POST',
    // Ratings change when a series ends, so an hour of edge cache is generous
    // and collapses the frontend's fan-out across all fifteen lists.
    ttl: 3600,
    params: {
      category: { type: 'string', enum: ['player', 'team'], default: 'player' },
      gender: { type: 'string', enum: ['men', 'women'], default: 'men' },
      type: { type: 'string', enum: ['test', 'odi', 't20'], default: 'test' },
      play: { type: 'string', enum: ['batting', 'bowling', 'allrounder', 'team'], default: 'batting' },
      page: { type: 'string', default: '1' },
    },
    note: 'ICC player rankings; type=test|odi|t20, play=batting|bowling|allrounder',
  },
  {
    // The full schedule — past results and upcoming matches — from crex's own
    // fixtures page. Lives on `stats`, not `oc`: their bundle builds it from
    // `baseNewUrl`, which is why probing `oc` for it only ever 404s.
    //
    // Upstream body is `{tl,type,page,wise,lang,formatType}`. `tl` is a
    // three-slot filter array, and the three ints in it are ids from crex's own
    // dropdowns — gender, format, level, in that order. `type` and `formatType`
    // are inert on the wire (their UI uses them for labels, not filtering), so
    // they are pinned in bodyDefaults rather than exposed.
    //
    // Pagination, verified against the live endpoint:
    //   wise=1  date-wise. Flat array, 20 matches per page, ~2-3 days' worth.
    //           page 0 starts today; page grows forward and goes NEGATIVE for
    //           results already played (-1 is the days before today). This is
    //           the only mode where page does anything useful.
    //   wise=2  series-wise. Object keyed by month ("August 2026"); page steps
    //           a month or two at a time, negative for past.
    //   wise=3  team-wise. Object keyed by team id, ~1900 keys, and it IGNORES
    //           page entirely — one call is the whole set.
    // Slots out of range 400 upstream, so they are enum-bounded here.
    match: '/fixtures',
    base: 'stats',
    path: '/fixture/getFixture',
    method: 'POST',
    // A schedule, not a scoreboard: rows only move when a match finishes, and
    // finished-match detail belongs to /matches/live and /match/scorecard.
    ttl: 300,
    params: {
      wise: { type: 'string', enum: ['1', '2', '3'], default: '1' },
      // Bounded rather than open: at 20 matches a page this already reaches
      // roughly four months either side of today, and an unbounded page number
      // is an unbounded number of cache entries.
      page: { type: 'int', default: 0, min: -60, max: 60 },
      gender: { type: 'int', enum: [0, 5, 6], default: 0 }, // 0=all 5=men 6=women
      format: { type: 'int', enum: [0, 1, 2, 3, 4, 5], default: 0 }, // 1=odi 2=t20 3=test 4=t10 5=100b
      level: { type: 'int', enum: [0, 7, 8], default: 0 }, // 0=all 7=international 8=domestic
    },
    bodyDefaults: { type: '0', lang: 'en', formatType: '' },
    buildBody: (p) => ({
      tl: [p.gender, p.format, p.level],
      page: p.page,
      wise: p.wise,
    }),
    note: 'Schedule; wise 1=date 2=series 3=team, page 0=today and negative=past (wise=1,2 only)',
  },
  {
    // Every match in one series — the whole competition, not the live window.
    //
    // This is what /matches/live cannot answer. That feed is a rolling window of
    // what is on now, next and just gone, so a series rolled up from it reports
    // "2 matches, 12–14 August" for a tournament that actually runs 34 matches
    // across a month. This endpoint returns the lot: every match keyed by date,
    // with the match f_key (`mf`), both team keys (`t1f`/`t2f`), venue (`vf`),
    // match number (`mn`), start time (`t`, epoch ms), status (`s`: 0 upcoming,
    // 1 live, 2 finished) and result text (`r`) once played.
    //
    // The body param is `fkey`, which is worth recording because nothing else
    // works: `seriesId`, `seriesKey`, `sf`, `series_fkey` and friends all come
    // back "Not a valid Request", and `id` reaches the SQL layer and errors
    // there. It takes a series f_key ("2AW"), the same one /mapping resolves.
    match: '/series/matches',
    base: 'oc',
    path: '/seriesInside/getMatchForSeriesID',
    method: 'POST',
    // A schedule, like /fixtures: rows only move when a match finishes, and the
    // live detail of a match in progress comes from /matches/live instead.
    ttl: 300,
    params: {
      key: { type: 'string', required: true },
    },
    buildBody: (p) => ({ fkey: p.key }),
    note: 'All matches in a series, grouped by date: /series/matches?key=2AW',
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
      if (spec.min !== undefined && n < spec.min) {
        throw new ParamError(`Param '${name}' must be >= ${spec.min}, got '${raw}'`);
      }
      if (spec.max !== undefined && n > spec.max) {
        throw new ParamError(`Param '${name}' must be <= ${spec.max}, got '${raw}'`);
      }
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
