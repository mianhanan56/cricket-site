// Validation for tab/filter values arriving from the URL (see lib/urlFilters.ts), shared by
// the static pages' client readers and the dynamic pages that still read `searchParams`.

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
