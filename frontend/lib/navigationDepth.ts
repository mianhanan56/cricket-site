// history.length and document.referrer can't tell whether the entry behind this one is ours,
// so the Back control asks the Navigation API, or failing that this tracker of our own entries.

export interface HistoryTrack {
  entries: string[];
  index: number;
}

export function startTrack(path: string): HistoryTrack {
  return { entries: [path], index: 0 };
}

/** A push drops any forward entries, as the browser does. */
export function pushEntry(track: HistoryTrack, path: string): HistoryTrack {
  if (track.entries[track.index] === path) return track;
  return { entries: [...track.entries.slice(0, track.index + 1), path], index: track.index + 1 };
}

// popstate carries no direction and Next.js overwrites history.state on every navigation,
// so the step is inferred from the neighbouring paths. Back wins a tie: it can only
// under-report an in-app entry, which sends the Back control to its in-site fallback.
export function traverseEntry(track: HistoryTrack, path: string): HistoryTrack {
  const { entries, index } = track;
  if (entries[index] === path) return track;
  if (index > 0 && entries[index - 1] === path) return { entries, index: index - 1 };
  if (entries[index + 1] === path) return { entries, index: index + 1 };
  return startTrack(path);
}

export function hasEntryBehind(track: HistoryTrack): boolean {
  return track.index > 0;
}

let track: HistoryTrack | null = null;

export function recordPush(path: string): void {
  track = track ? pushEntry(track, path) : startTrack(path);
}

export function recordTraversal(path: string): void {
  track = track ? traverseEntry(track, path) : startTrack(path);
}

interface NavigationLike {
  canGoBack: boolean;
}

/** True when Back leads somewhere on this site. Browser-only. */
export function canGoBackInApp(): boolean {
  const nav = (window as Window & { navigation?: NavigationLike }).navigation;
  // Its entry list holds only same-origin entries, which is exactly the question.
  if (nav && typeof nav.canGoBack === 'boolean') return nav.canGoBack;

  if (track && hasEntryBehind(track)) return true;
  // A same-origin referrer means the first entry of this document has one of ours behind it.
  try {
    const from = document.referrer;
    return Boolean(from) && new URL(from).origin === window.location.origin;
  } catch {
    return false;
  }
}
