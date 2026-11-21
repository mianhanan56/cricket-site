// A record between two sides, derived from a schedule corpus (`getApiFixtureRange`):
// the upstream has no head-to-head endpoint. A meeting whose result names no side we
// recognise is `unresolved`, never a draw.

import type { HeadToHead, HeadToHeadMatch, Match, Team } from '@/types';
import { attributeResult } from './api';

/** Meetings listed on the page. Enough to show a pattern, short enough to read. */
const RECENT_MEETINGS = 5;

/** Did these two sides play each other in this match, either way round? */
function isMeeting(m: Match, a: string, b: string): boolean {
  const ids = [m.homeTeam.id, m.awayTeam.id];
  return ids.includes(a) && ids.includes(b);
}

/** A drawn, tied or abandoned match, as the upstream words those. A tie someone won is not one. */
function isNoResult(result: string): boolean {
  return /\b(draw|drawn|tie|tied|no result|abandon|cancel)/i.test(result) && !/\bwon\b/i.test(result);
}

/**
 * The record between two sides over the corpus. `homeWins` is the first argument's
 * wins wherever they played. Null when they never met inside the window — not a 0-0.
 */
export function headToHead(
  home: Team,
  away: Team,
  corpus: Match[],
  opts: { exclude?: string | null } = {}
): HeadToHead | null {
  if (!home.id || !away.id || home.id === away.id) return null;

  // The match being viewed is in the corpus, and is not part of its own head-to-head.
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
      sides: [
        { id: m.homeTeam.id, shortName: m.homeTeam.shortName, name: m.homeTeam.name },
        { id: m.awayTeam.id, shortName: m.awayTeam.shortName, name: m.awayTeam.name },
      ],
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
