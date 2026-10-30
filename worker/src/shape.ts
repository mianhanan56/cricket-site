// The upstream answers in single-letter keys ("c1", "fv", "t1f"). Each route's shape renames
// the keys the frontend reads to plain words and drops the rest. Values are passed on as sent.

/** Upstream key → readable name, or readable name plus how to shape what is under it. */
export type Rename = Record<string, string | readonly [string, Shaper]>;

export type Shaper = (value: unknown) => unknown;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Keep only the keys in `map`, under their new names. An array is renamed item by item. */
export function rename(value: unknown, map: Rename): unknown {
  if (Array.isArray(value)) return value.map((item) => rename(item, map));
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [from, to] of Object.entries(map)) {
    if (!(from in value)) continue;
    if (typeof to === 'string') out[to] = value[from];
    else out[to[0]] = to[1](value[from]);
  }
  return out;
}

/** A shaper for `rename(value, map)`. */
export const fields =
  (map: Rename): Shaper =>
  (value) =>
    rename(value, map);

/** An object keyed by ids (match ids, month names): keep every key, shape every value. */
export const keyed =
  (shape: Shaper): Shaper =>
  (value) =>
    isPlainObject(value) ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v)])) : value;

/** Bump when any shape changes, so the edge cache never serves a body in the old shape. */
export const SHAPE_VERSION = 3;
