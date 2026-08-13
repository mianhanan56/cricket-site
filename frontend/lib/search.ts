// Search, without a search index.
//
// This used to be a Postgres query over players, teams and series. With the
// backend gone the only corpus available is the match list the crex Worker
// already serves — every live, upcoming and recent match, with both teams, the
// series and the venue attached. That is a few hundred rows at most, so it is
// searched in memory rather than by asking anything upstream.
//
// Two consequences worth being explicit about:
//
//   1. **Matches are the only result type.** A team or a series is matched on,
//      but what comes back is its matches, because a match is the only one of
//      the three with a page to link to. Grouping results by entity would mean
//      rows that navigate nowhere.
//   2. **Players are not searchable.** crex has no search endpoint and its
//      player endpoint (oc/player/getPlayerInfo) is payload-blocked, so there
//      is no player corpus to search. Nothing is silently degraded here — the
//      placeholder text says teams, series and venues.

import type { Match } from '@/types';
import { getCrexMatchList } from './crex';

/** How long a fetched match list is reused across queries. */
const CACHE_MS = 60_000;

let cache: { at: number; matches: Match[] } | null = null;
let inflight: Promise<Match[]> | null = null;

/**
 * The corpus, fetched at most once a minute.
 *
 * `inflight` matters as much as `cache`: two components mount this (the navbar
 * and the search page) and a debounced keystroke can fire while a previous
 * fetch is still open. Without collapsing them, one burst of typing costs
 * several identical round-trips.
 */
async function corpus(): Promise<Match[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.matches;
  if (inflight) return inflight;

  inflight = getCrexMatchList()
    .then((matches) => {
      cache = { at: Date.now(), matches };
      return matches;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

/** Everything about a match a query could reasonably be aimed at. */
function haystack(m: Match): string {
  return [
    m.homeTeam.name,
    m.homeTeam.shortName,
    m.homeTeam.country,
    m.awayTeam.name,
    m.awayTeam.shortName,
    m.awayTeam.country,
    m.series?.name,
    m.venue,
    m.format,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

// Live first — if you search "India" mid-match, that match is the answer.
const STATUS_ORDER: Record<Match['status'], number> = { LIVE: 0, UPCOMING: 1, COMPLETED: 2 };

/**
 * Match every whitespace-separated term against the row (AND, not OR), so
 * "india test" narrows rather than widens.
 *
 * Never throws: search failing should empty the dropdown, not surface an error
 * over the whole page.
 */
export async function searchMatches(query: string, limit = 12): Promise<Match[]> {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];

  let matches: Match[];
  try {
    matches = await corpus();
  } catch {
    return [];
  }

  return matches
    .filter((m) => {
      const text = haystack(m);
      return terms.every((t) => text.includes(t));
    })
    .sort((a, b) => {
      const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      if (byStatus !== 0) return byStatus;
      // Within a status, soonest-or-most-recent first.
      const at = new Date(a.startTime).getTime();
      const bt = new Date(b.startTime).getTime();
      return a.status === 'COMPLETED' ? bt - at : at - bt;
    })
    .slice(0, limit);
}

/** "IND vs AUS" — the label a result row leads with. */
export const matchLabel = (m: Match): string =>
  `${m.homeTeam.shortName} vs ${m.awayTeam.shortName}`;

/** Series name, falling back to the venue when a match has no series attached. */
export const matchSublabel = (m: Match): string => m.series?.name || m.venue || '';
