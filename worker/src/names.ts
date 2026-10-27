import type { ParamValue } from './routes';

// The /mapping edge cache is keyed by the whole key set, so one unseen key misses it for
// every key in the request (~1s upstream). Names don't change, so the isolate keeps each
// one it has served and the upstream is asked only for keys it has never seen.

const BUCKETS = ['t', 'v', 's', 'p', 'u'] as const;
type Bucket = (typeof BUCKETS)[number];

export interface MapEntry {
  f_key: string;
  [field: string]: unknown;
}

export type Mapping = Record<Bucket, MapEntry[]>;

// Bounds memory on a long-lived isolate; a player entry is well under 100 bytes.
const LIMIT: Record<Bucket, number> = { t: 5_000, v: 5_000, s: 5_000, p: 40_000, u: 2_000 };

const known: Record<Bucket, Map<string, MapEntry>> = {
  t: new Map(),
  v: new Map(),
  s: new Map(),
  p: new Map(),
  u: new Map(),
};

// A key the upstream doesn't name would otherwise be asked for on every request it's in.
const ABSENT_MS = 5 * 60_000;
const absent: Record<Bucket, Map<string, number>> = {
  t: new Map(),
  v: new Map(),
  s: new Map(),
  p: new Map(),
  u: new Map(),
};

const emptyMapping = (): Mapping => ({ t: [], v: [], s: [], p: [], u: [] });

/** The entries already held, and params for the keys that aren't (null when every key is held). */
export function splitKnown(params: Record<string, ParamValue>): {
  held: Mapping;
  rest: Record<string, ParamValue> | null;
} {
  const held = emptyMapping();
  const rest: Record<string, ParamValue> = { ...params };
  let missing = 0;

  for (const bucket of BUCKETS) {
    const keys = params[bucket];
    const ask: string[] = [];
    for (const key of Array.isArray(keys) ? keys : []) {
      const entry = known[bucket].get(key);
      if (entry) held[bucket].push(entry);
      else if ((absent[bucket].get(key) ?? 0) < Date.now()) ask.push(key);
    }
    rest[bucket] = ask;
    missing += ask.length;
  }

  return { held, rest: missing ? rest : null };
}

/**
 * Keep every entry in an upstream answer to `asked`, evicting the oldest written once a bucket
 * is full, and note the asked keys it left out.
 */
export function remember(asked: Record<string, ParamValue>, mapping: Partial<Mapping>): void {
  const now = Date.now();
  for (const bucket of BUCKETS) {
    const list = mapping[bucket];
    if (!Array.isArray(list)) continue;

    const store = known[bucket];
    for (const entry of list) {
      if (typeof entry?.f_key !== 'string') continue;
      store.delete(entry.f_key);
      store.set(entry.f_key, entry);
    }
    for (const key of store.keys()) {
      if (store.size <= LIMIT[bucket]) break;
      store.delete(key);
    }

    const gone = absent[bucket];
    for (const [key, until] of gone) if (until < now) gone.delete(key);
    const keys = asked[bucket];
    for (const key of Array.isArray(keys) ? keys : []) {
      if (!store.has(key) && gone.size < LIMIT[bucket]) gone.set(key, now + ABSENT_MS);
    }
  }
}

/** Held entries plus an upstream answer, in the upstream's shape (every bucket present). */
export function merge(held: Mapping, fetched: Partial<Mapping>): Mapping {
  const out = emptyMapping();
  for (const bucket of BUCKETS) {
    const more = fetched[bucket];
    out[bucket] = [...held[bucket], ...(Array.isArray(more) ? more : [])];
  }
  return out;
}
