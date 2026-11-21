// The URL's query as the router sees it, for static pages that read filters after mount.
// Published by SearchParamsBridge, which is the only useSearchParams() reader so the
// rest of each page can still be prerendered.
const listeners = new Set<() => void>();
let current: string | null = null;

export function publishSearch(search: string) {
  if (search === current) return;
  current = search;
  listeners.forEach((l) => l());
}

export function onSearchChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
