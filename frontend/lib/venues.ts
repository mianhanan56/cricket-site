// ============================================================================
// venues.ts — what a ground has done lately, derived from the schedule
//
// There is no venue endpoint. Every ground in the app is a caption on a match
// card, and the only thing that knows which matches were played where is the
// schedule — which carries a venue key, the two sides, both scores and the
// result sentence on every finished row.
//
// So the same corpus that feeds head-to-head feeds this, and the one statistic
// it can honestly produce is the one readers actually ask a venue page for:
// does chasing work here.
//
// What is deliberately NOT here is an average first-innings score. The schedule
// gives `s1`/`s2` by *team*, not by innings, so which of the two batted first is
// only recoverable from the result wording — and only on matches that produced a
// result. An average over that subset would be a number with a silent asterisk
// on it, which is worse than no number.
// ============================================================================

import type { Match, Team, VenueProfile } from '@/types';
import { attributeResult } from './crex';

/** Sides listed as playing here regularly. A ground's tenants, not its visitors. */
const REGULARS = 6;

/** Finished matches listed. Long enough to be a record, short enough to scan. */
const RESULTS_SHOWN = 12;

/** Upcoming fixtures listed. */
const FIXTURES_SHOWN = 8;

/**
 * A ground's record over whatever the corpus covers.
 *
 * `name` is passed in rather than looked up: the caller already resolved it (a
 * venue key means nothing to a reader) and this module does no fetching.
 *
 * Returns null when the corpus has no match at the key at all — a ground that is
 * real but has not been used inside the window has no page worth serving, and
 * saying so is better than an empty one.
 */
export function venueProfile(
  venueId: string,
  name: string,
  corpus: Match[]
): VenueProfile | null {
  const key = venueId.trim();
  if (!key) return null;

  // Deduped as everything read out of the corpus is — overlapping schedule pages
  // repeat a day's tail, and a repeated match shifts the chase/defend split.
  const seen = new Set<string>();
  const here: Match[] = [];
  for (const m of corpus) {
    if (m.venueId !== key) continue;
    const id = m.id || `${m.startTime}-${m.homeTeam.id}-${m.awayTeam.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    here.push(m);
  }
  if (!here.length) return null;

  const finished = here
    .filter((m) => m.status === 'COMPLETED' && m.result)
    .sort((a, b) => +new Date(b.startTime) - +new Date(a.startTime));

  let chased = 0;
  let defended = 0;
  let inconclusive = 0;

  const played = finished.map((m) => {
    const { winnerKey, method } = attributeResult(m.result, m.homeTeam, m.awayTeam);
    // A win with no readable margin counts as inconclusive rather than being
    // assigned to either column — the same rule as the head-to-head record.
    if (winnerKey && method === 'CHASED') chased++;
    else if (winnerKey && method === 'DEFENDED') defended++;
    else inconclusive++;

    return {
      id: m.id || null,
      key: m.id || `${m.startTime}-${m.homeTeam.id}`,
      startTime: m.startTime,
      venue: m.venue,
      format: m.format,
      series: m.series.name,
      result: m.result ?? '',
      winnerKey,
    };
  });

  // Appearances, both sides of every match — a ground's regulars are the sides
  // that keep turning up, whichever end of the fixture they were listed at.
  const tally = new Map<string, { team: Team; matches: number }>();
  for (const m of here) {
    for (const team of [m.homeTeam, m.awayTeam]) {
      if (!team.id) continue;
      const row = tally.get(team.id);
      if (row) row.matches++;
      else tally.set(team.id, { team, matches: 1 });
    }
  }

  const scheduled = here
    .filter((m) => m.status !== 'COMPLETED')
    .sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime));

  return {
    id: key,
    name,
    // Both lists are sliced for display and both counts are of the whole set.
    // The split above is counted over every finished match, so a page that read
    // its total off `played.length` would print "12 played" beside "14 decided".
    played: played.slice(0, RESULTS_SHOWN),
    playedCount: played.length,
    upcoming: scheduled.slice(0, FIXTURES_SHOWN),
    upcomingCount: scheduled.length,
    chased,
    defended,
    inconclusive,
    regulars: [...tally.values()]
      .sort((a, b) => b.matches - a.matches || a.team.name.localeCompare(b.team.name))
      .slice(0, REGULARS),
  };
}
