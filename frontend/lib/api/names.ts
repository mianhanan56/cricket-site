// Teams, venues, series, players and umpires arrive as opaque keys ("11", "BK",
// "^1JK"). /mapping turns them into names; this module caches every answer so a
// poll only ever asks for keys it has not seen.
import type { Team } from '@/types';
import { cleanVenueName } from '../venue';
import { apiGet, type FetchOpts } from './client';

export interface ApiMapEntry {
  key: string;
  name: string;
  /** Teams and series only. */
  shortName?: string;
  /** Club colours, teams only. `primaryColor` is "0-#8F65E6" (a mode flag, then the hex); `secondaryColor` is plain hex. */
  primaryColor?: string;
  secondaryColor?: string;
}

export interface ApiMapping {
  teams?: ApiMapEntry[];
  venues?: ApiMapEntry[];
  series?: ApiMapEntry[];
  players?: ApiMapEntry[];
  umpires?: ApiMapEntry[];
}

/** The request's bucket params: teams, venues, series, players, umpires. */
export type ApiMapKind = 't' | 'v' | 's' | 'p' | 'u';

/** Which response bucket answers each request bucket. */
export const MAP_BUCKET: Record<ApiMapKind, keyof ApiMapping> = {
  t: 'teams',
  v: 'venues',
  s: 'series',
  p: 'players',
  u: 'umpires',
};

/** Resolve keys to names. Empty buckets are left out to keep the Worker's cache key small. */
export function getApiMapping(
  keys: Partial<Record<ApiMapKind, string[]>>,
  opts: FetchOpts = {}
): Promise<ApiMapping> {
  const qs = new URLSearchParams();
  for (const [kind, list] of Object.entries(keys)) {
    if (list?.length) qs.set(kind, [...new Set(list)].sort().join(','));
  }
  if (![...qs.keys()].length) return Promise.resolve({});

  return apiGet<ApiMapping>(`/mapping?${qs}`, { revalidate: 21600, ...opts });
}

// A key means the same thing tomorrow, so names are kept for the life of the process.
const nameCache: Record<ApiMapKind, Map<string, ApiMapEntry>> = {
  t: new Map(),
  v: new Map(),
  s: new Map(),
  p: new Map(),
  u: new Map(),
};

export type NameCache = typeof nameCache;

// The cache lives as long as a server process does, and the player space is
// unbounded, so each bucket is capped well above a realistic working set.
const CACHE_LIMIT: Record<ApiMapKind, number> = {
  t: 4_000,
  v: 4_000,
  s: 4_000,
  p: 20_000,
  u: 1_000,
};

/** Write a name, evicting the oldest *written* entries once the bucket is full. */
function remember(kind: ApiMapKind, entry: ApiMapEntry): void {
  if (kind === 'v') entry = { ...entry, name: cleanVenueName(entry.name) };
  const bucket = nameCache[kind];
  bucket.delete(entry.key);
  bucket.set(entry.key, entry);

  const excess = bucket.size - CACHE_LIMIT[kind];
  if (excess <= 0) return;

  const oldest = bucket.keys();
  for (let i = 0; i < excess; i++) {
    const key = oldest.next();
    if (key.done) break;
    bucket.delete(key.value);
  }
}

// Keys with a /mapping request already open, so concurrent renders share it
// instead of each asking for the same few hundred keys.
const inFlight = new Map<string, Promise<void>>();

const flightKey = (kind: ApiMapKind, key: string): string => `${kind}:${key}`;

/** The upstream prefixes some keys with "^" on the match object but not in the map. */
export const cleanKey = (key: string | undefined): string => (key ?? '').replace(/^\^/, '');

/** The Worker caps /mapping at 200 keys per bucket. */
const MAPPING_BATCH = 200;

/** Fetch whichever of these keys are not cached or already in flight, then return the cache. */
export async function resolveKeys(
  wanted: Partial<Record<ApiMapKind, Iterable<string>>>,
  opts: FetchOpts = {}
): Promise<NameCache> {
  const missing: Partial<Record<ApiMapKind, string[]>> = {};
  // Requests someone else already has open for keys we also want.
  const shared = new Set<Promise<void>>();
  let batches = 0;

  for (const [kind, keys] of Object.entries(wanted) as Array<[ApiMapKind, Iterable<string>]>) {
    const list: string[] = [];

    for (const key of new Set([...(keys ?? [])].map(cleanKey))) {
      if (!key || nameCache[kind].has(key)) continue;

      const open = inFlight.get(flightKey(kind, key));
      if (open) shared.add(open);
      else list.push(key);
    }

    if (list.length) {
      missing[kind] = list;
      batches = Math.max(batches, Math.ceil(list.length / MAPPING_BATCH));
    }
  }

  if (!batches) {
    // Returning before another caller's fetch lands would hand back a cache with holes.
    if (shared.size) await Promise.all(shared);
    return nameCache;
  }

  // One request per slice across all buckets, so a payload's teams and venues arrive together.
  const requests: Promise<unknown>[] = [];
  for (let i = 0; i < batches; i++) {
    const slice = Object.fromEntries(
      Object.entries(missing)
        .map(([kind, list]) => [kind, list.slice(i * MAPPING_BATCH, (i + 1) * MAPPING_BATCH)])
        .filter(([, list]) => list.length)
    ) as Partial<Record<ApiMapKind, string[]>>;

    const entries = Object.entries(slice) as Array<[ApiMapKind, string[]]>;
    if (!entries.length) continue;

    const request = getApiMapping(slice, opts).then((mapping) => {
      for (const kind of ['t', 'v', 's', 'p', 'u'] as const) {
        for (const entry of mapping[MAP_BUCKET[kind]] ?? []) remember(kind, entry);
      }
    });

    // What other callers wait on. It never rejects (a failure is this caller's to
    // handle, not theirs) and always clears the registry so the keys are retried.
    const settled = request.catch(() => undefined).finally(() => {
      for (const [kind, list] of entries) {
        for (const key of list) inFlight.delete(flightKey(kind, key));
      }
    });

    for (const [kind, list] of entries) {
      for (const key of list) inFlight.set(flightKey(kind, key), settled);
    }

    requests.push(request);
  }

  await Promise.all([...requests, ...shared]);

  return nameCache;
}

/** The upstream serves team badges off Akamai, keyed by the same f_key as the match. */
const TEAM_LOGO_BASE = 'https://cricketvectors.akamaized.net/Teams';

/** The upstream's illustrated player portraits, keyed by the player f_key. */
const PLAYER_IMAGE_BASE = 'https://cricketvectors.akamaized.net/players/org';

/** Crest URL for a team f_key, or null when there is no key to build one from. */
export function teamLogoUrl(key: string | undefined): string | null {
  const clean = cleanKey(key);
  return clean ? `${TEAM_LOGO_BASE}/${clean}.png` : null;
}

export const playerImageUrl = (key: string) => `${PLAYER_IMAGE_BASE}/${key}.png`;

/** A team from its key. An unresolved key degrades to the key itself rather than throwing. */
export function toTeam(key: string, names: NameCache): Team {
  const clean = cleanKey(key);
  const entry = names.t.get(clean);
  const name = entry?.name ?? clean;

  return {
    id: clean,
    name,
    shortName: entry?.shortName ?? clean,
    country: name,
    logo: teamLogoUrl(clean),
  };
}

/** A series as `{ id, name }`; "Cricket" when the mapping has no name for it. */
export function seriesRef(key: string, names: NameCache): { id: string; name: string } {
  return { id: key, name: names.s.get(key)?.name ?? 'Cricket' };
}

/** The ground's name ("TBD" when unknown) and its key (null when there is none). */
export function venueOf(key: string | undefined, names: NameCache): { venue: string; venueId: string | null } {
  const id = cleanKey(key);
  return { venue: names.v.get(id)?.name ?? 'TBD', venueId: id || null };
}

/** A player's name as the upstream prints it on a card: the third name token, or the last if shorter. */
export function shortName(key: string | undefined, names: NameCache): string {
  if (!key) return '';
  const full = names.p.get(key)?.name;
  if (!full) return key;

  const parts = full.trim().split(/\s+/);
  return parts[Math.min(parts.length - 1, 2)];
}
