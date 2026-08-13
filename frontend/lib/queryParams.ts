// Validation for tab/filter values arriving from the URL.
//
// Lives outside the hooks layer because both sides need it: the server pages
// read `searchParams` and hand the validated value down, and the client tab
// rows use the same function when a value comes back off the URL.

export type RawParam = string | string[] | undefined | null;

/**
 * Coerce a search param to one of `allowed`, falling back when it is missing,
 * repeated with a junk first value, or simply not a value we render.
 * Comparison is lower-case, so ?format=T20 and ?format=t20 both work.
 */
export function pickParam<T extends string>(
  raw: RawParam,
  allowed: readonly T[],
  fallback: T
): T {
  const first = Array.isArray(raw) ? raw[0] : raw;
  const value = first?.toLowerCase();
  return (allowed as readonly string[]).includes(value ?? '') ? (value as T) : fallback;
}
