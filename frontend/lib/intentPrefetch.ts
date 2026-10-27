/**
 * Spread on a `<Link>` in a list: no prefetch on sight — a screen of match tiles or player
 * names was a server render each — but `IntentPrefetch` warms it on hover, touch or focus.
 */
export const ON_INTENT = { prefetch: false, 'data-prefetch': 'intent' } as const;
