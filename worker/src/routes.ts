// Allowlist of upstream CricLive routes this Worker proxies.
//
// Why an allowlist and not a blind `/*` pass-through: the API token lives in the
// Worker, so a wildcard proxy would let anyone who finds the URL spend your
// subscription on arbitrary endpoints. Only what's listed here is reachable.
//
// Paths and TTLs are taken from the CricLive API Reference. Base URL is
// https://cricketliveapi.com/api/v1 (set in wrangler.toml).
//
// `auth: 'token'` marks the endpoints CricLive gates behind a Bearer token plus
// an active subscription. Everything else is public and needs no credentials at
// all — which is most of what the UI reads.

/** Categories accepted by the /series, /schedule and /teams endpoints. */
export const CATEGORIES = ['all', 'international', 'domestic', 'league', 'women'] as const;

export interface RouteDef {
  /** Incoming path on the Worker. `:name` marks a dynamic segment. */
  match: string;
  /** Upstream path appended to UPSTREAM_BASE, same `:name` placeholders. */
  path: string;
  /** Edge cache lifetime in seconds — mirrors CricLive's own cache TTL. */
  ttl: number;
  /** 'token' routes need CRICKET_API_TOKEN + an active subscription. */
  auth?: 'public' | 'token';
  /**
   * Constrains a dynamic segment to a fixed set of values. Stops junk segments
   * from reaching upstream and fragmenting the cache.
   */
  enums?: Record<string, readonly string[]>;
}

export const ROUTES: RouteDef[] = [
  // --- Public: no credentials required -------------------------------------
  {
    match: '/cricket/matches/live',
    path: '/cricket/matches/live',
    ttl: 15,
  },
  {
    match: '/cricket/matches/recent',
    path: '/cricket/matches/recent',
    ttl: 300,
  },
  {
    match: '/cricket/matches/upcoming',
    path: '/cricket/matches/upcoming',
    ttl: 300,
  },
  {
    match: '/cricket/series/:category',
    path: '/cricket/series/:category',
    ttl: 300,
    enums: { category: CATEGORIES },
  },
  {
    match: '/cricket/schedule/:category',
    path: '/cricket/schedule/:category',
    ttl: 300,
    enums: { category: CATEGORIES },
  },
  {
    match: '/cricket/teams/:category',
    path: '/cricket/teams/:category',
    ttl: 3600,
    enums: { category: CATEGORIES },
  },
  {
    // Toss, umpires, referee, venue, squads. `slug` comes from the match object
    // returned by the /matches/* endpoints.
    match: '/cricket/match-facts/:matchId/:slug',
    path: '/cricket/match-facts/:matchId/:slug',
    ttl: 300,
  },
  {
    // Live miniscore — striker/non-striker, current bowler, CRR/RRR, partnership.
    match: '/cricket/live-scorecard/:matchId/:slug',
    path: '/cricket/live-scorecard/:matchId/:slug',
    ttl: 15,
  },

  // --- Protected: Bearer token + active subscription -----------------------
  {
    // Featured live scores (~6 matches). The public /matches/live returns more.
    match: '/cricket/live',
    path: '/cricket/live',
    ttl: 15,
    auth: 'token',
  },
  {
    match: '/cricket/match/:matchId/scorecard',
    path: '/cricket/match/:matchId/scorecard',
    ttl: 30,
    auth: 'token',
  },
  {
    match: '/cricket/match/:matchId/commentary',
    path: '/cricket/match/:matchId/commentary',
    ttl: 15,
    auth: 'token',
  },
  {
    match: '/cricket/match/:matchId/squads',
    path: '/cricket/match/:matchId/squads',
    ttl: 300,
    auth: 'token',
  },
  {
    match: '/cricket/match/:matchId/highlights',
    path: '/cricket/match/:matchId/highlights',
    ttl: 60,
    auth: 'token',
  },

  // CricLive also exposes legacy query-string variants (/cricket/schedule?type=,
  // /cricket/series?category=, /cricket/teams?type=). Deliberately omitted —
  // the path-based versions above supersede them.
];

export interface Matched {
  route: RouteDef;
  /** Upstream path with placeholders substituted. */
  upstreamPath: string;
}

/**
 * Resolve an incoming pathname against ROUTES. Segment counts must be equal;
 * `:name` matches any single non-empty segment, subject to `enums`.
 */
export function matchRoute(pathname: string): Matched | null {
  const parts = split(pathname);

  for (const route of ROUTES) {
    const pattern = split(route.match);
    if (pattern.length !== parts.length) continue;

    const params: Record<string, string> = {};
    const ok = pattern.every((seg, i) => {
      if (!seg.startsWith(':')) return seg === parts[i];

      const name = seg.slice(1);
      const allowed = route.enums?.[name];
      if (allowed && !allowed.includes(parts[i])) return false;

      params[name] = parts[i];
      return true;
    });
    if (!ok) continue;

    const upstreamPath = split(route.path)
      .map((seg) => (seg.startsWith(':') ? encodeURIComponent(params[seg.slice(1)]) : seg))
      .join('/');

    return { route, upstreamPath: '/' + upstreamPath };
  }

  return null;
}

function split(p: string): string[] {
  return p.split('/').filter(Boolean);
}
