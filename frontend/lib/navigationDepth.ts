// How many in-app navigations this document has made.
//
// The question a back control actually needs answered is "is the previous
// history entry one of ours?", and neither obvious signal answers it alone:
//
//   `history.length > 1` counts entries from before the reader ever reached
//   this site, so a shared link opened in a tab that had been used for anything
//   else reads as poppable and sends them back out to whatever they were on.
//
//   `document.referrer` is set when the DOCUMENT loads and is untouched by
//   pushState, so every soft navigation inside the app — the common case, and
//   the one where Back is definitely right — looks like a cold arrival.
//
// So: count the soft navigations ourselves. Module state lives as long as the
// document and resets on a full load, which is exactly the lifetime being asked
// about. Combined with a same-origin referrer (which covers arriving here by a
// hard navigation from one of our own pages) it gives a complete answer.

let depth = 0;

const listeners = new Set<() => void>();

/** Called by the tracker in the root layout on every route change. */
export function pushNavigation(): void {
  depth += 1;
  for (const listener of listeners) listener();
}

/** Navigations made since this document loaded. 0 means the reader arrived here directly. */
export function navigationDepth(): number {
  return depth;
}

export function subscribeNavigation(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * True when Back leads somewhere on this site.
 *
 * Browser-only — there is no history on the server, and the caller resolves
 * this after mount for that reason.
 */
export function canGoBackInApp(): boolean {
  if (navigationDepth() > 0) return true;

  try {
    const from = document.referrer;
    return Boolean(from) && new URL(from).origin === window.location.origin;
  } catch {
    // An unparseable referrer is not a same-origin one.
    return false;
  }
}
