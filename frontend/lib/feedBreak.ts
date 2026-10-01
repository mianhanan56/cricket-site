import type { MatchEvent, MatchNote } from '@/types';

// How crex's commentators announce an interval: "7:44 PM IST & Local Time: Drinks Break!".
// Strict on purpose — a stats note that mentions tea is not tea.
const ANNOUNCEMENTS: Array<[RegExp, string]> = [
  [/\bdrinks(\s+break)?\s*!|\bdrinks\s+break\b/i, 'Drinks Break'],
  [/\blunch(\s+break)?\s*!|\blunch\s+(break|on\s+day)\b/i, 'Lunch Break'],
  [/\btea(\s+break)?\s*!|\btea\s+(break|on\s+day)\b/i, 'Tea Break'],
];

/**
 * An interval the commentary has announced and no delivery has followed.
 *
 * `/matches/live` only latches break codes (see `isStaleStoppage`), and crex's
 * own live stream is not read, so the feed's note rows are the one fresh signal:
 * a note posted after the last ball that calls drinks means drinks, and the next
 * ball bowled ends it.
 */
export function breakFromFeed(events: MatchEvent[], lastBallAt: string | null | undefined): MatchNote | null {
  if (!lastBallAt) return null;
  const after = +new Date(lastBallAt);
  for (const e of events) {
    if (e.kind !== 'NOTE' || !e.timestamp || +new Date(e.timestamp) <= after) continue;
    const hit = ANNOUNCEMENTS.find(([pattern]) => pattern.test(e.text ?? ''));
    if (hit) return { label: hit[1], kind: 'BREAK', paused: true };
  }
  return null;
}
