// ============================================================================
// headToHead.ts — a record between two sides, derived from the schedule
//
// crex has no head-to-head endpoint. What it has is a schedule whose finished
// rows carry a result *sentence*, and a sentence naming the winner is all a
// record needs. So this module is pure: hand it the two sides and a corpus of
// matches (see `getCrexFixtureRange`) and it counts.
//
// The honesty rule this is built around: a meeting whose result names no side we
// recognise is counted as `unresolved`, not as a draw. `attributeResult` matches
// a side's full name and short name exactly and nothing else — loose matching
// would file "St Kitts & Nevis Patriots won by 5 wickets" as a win for St Lucia,
// and a record that is quietly wrong is worse than one that admits a gap.
// ============================================================================

import type { HeadToHead, HeadToHeadMatch, Match, Team } from '@/types';
import { attributeResult } from './crex';

/** Meetings listed on the page. Enough to show a pattern, short enough to read. */
const RECENT_MEETINGS = 5;

/** Did these two sides play each other in this match, either way round? */
function isMeeting(m: Match, a: string, b: string): boolean {
  const ids = [m.homeTeam.id, m.awayTeam.id];
  return ids.includes(a) && ids.includes(b);
}

/** A drawn, tied or abandoned match, as crex words those. */
function isNoResult(result: string): boolean {
  return /\b(draw|drawn|tie|tied|no result|abandon|cancel)/i.test(result);
}

/**
 * The record between two sides over whatever the corpus covers.
 *
 * `home` and `away` fix the reporting order — `homeWins` is the first argument's
 * wins wherever they played, not their wins at home. A head-to-head is a record
 * between two sides, and which of them was nominally hosting a given match is
 * not something this counts.
 *
 * Returns null when they have never met inside the window, which is the common
 * case for a first meeting and is not the same as a 0-0 record.
 */
export function headToHead(
  home: Team,
  away: Team,
  corpus: Match[],
  opts: { exclude?: string | null } = {}
): HeadToHead | null {
  if (!home.id || !away.id || home.id === away.id) return null;

  // The match being viewed is not part of its own head-to-head. Without this a
  // finished match reports "1 meeting, 1–0" describing the result printed at the
  // top of the same page — the corpus covers today, so the match is in it.
  const exclude = opts.exclude ?? null;

  const meetings = corpus
    .filter(
      (m) =>
        m.status === 'COMPLETED' &&
        m.result &&
        m.id !== exclude &&
        isMeeting(m, home.id, away.id)
    )
    .sort((a, b) => +new Date(b.startTime) - +new Date(a.startTime));

  if (!meetings.length) return null;

  // Deduped on the match key: the corpus is assembled from overlapping schedule
  // pages, and a meeting counted twice is a record that is wrong by one.
  const seen = new Set<string>();
  const matches: HeadToHeadMatch[] = [];
  for (const m of meetings) {
    const key = m.id || `${m.startTime}-${m.homeTeam.id}-${m.awayTeam.id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    matches.push({
      id: m.id || null,
      key,
      startTime: m.startTime,
      venue: m.venue,
      format: m.format,
      series: m.series.name,
      result: m.result ?? '',
      winnerKey: attributeResult(m.result, home, away).winnerKey,
    });
  }

  let homeWins = 0;
  let awayWins = 0;
  let drawn = 0;
  let unresolved = 0;

  for (const m of matches) {
    if (m.winnerKey === home.id) homeWins++;
    else if (m.winnerKey === away.id) awayWins++;
    else if (isNoResult(m.result)) drawn++;
    else unresolved++;
  }

  return {
    home,
    away,
    played: matches.length,
    homeWins,
    awayWins,
    drawn,
    unresolved,
    matches: matches.slice(0, RECENT_MEETINGS),
  };
}
