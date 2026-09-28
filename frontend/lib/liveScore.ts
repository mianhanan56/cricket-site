import type { Match } from '@/types';
import { ballsFrom } from './overs';

const STATUS_ORDER: Record<Match['status'], number> = { UPCOMING: 0, LIVE: 1, COMPLETED: 2 };

/** How far a match has got: status first, then innings started, then balls bowled. */
function progress(m: Match): [number, number, number] {
  const batted = (m.scorecard?.innings ?? []).filter((i) => !i.notStarted);
  const balls = batted.reduce((n, i) => n + ballsFrom(i.overs, m.ballsPerOver || undefined), 0);
  return [STATUS_ORDER[m.status], batted.length, balls];
}

function behind(a: [number, number, number], b: [number, number, number]): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
}

/**
 * A poll's matches, minus any that went backwards. crex's list is served from
 * a cache, and a stale copy can land after a fresher one — the ticker read 91/2
 * and then 85/2 in the same over. Play only moves forward, so a snapshot behind
 * the one already shown is dropped for it until the feed catches up.
 */
export function keepNewest(prev: Match[], next: Match[]): Match[] {
  if (!prev.length) return next;
  const before = new Map(prev.map((m) => [m.id, m]));
  return next.map((m) => {
    const old = before.get(m.id);
    return old && behind(progress(m), progress(old)) ? old : m;
  });
}
