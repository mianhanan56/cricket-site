// ICC ranking lists. Keys resolve through /mapping.
import { apiGet, type FetchOpts } from './client';

export interface ApiRankingRow {
  /** Rating. */
  r: number;
  /** Team f_key. */
  tf: string;
  /** Player f_key. */
  pf: string;
  /** Previous position — the upstream draws its up/down arrow from this. */
  pr: number;
  /** Current position. */
  pos: number;
}

/**
 * One player list: format × gender × discipline. The upstream's own names — `type` is the
 * format and `play` the discipline (see /rankings/players in the Worker's routes.ts).
 */
export function getApiRankingList(
  params: { type: 'test' | 'odi' | 't20'; gender: 'men' | 'women'; play: 'batting' | 'bowling' | 'allrounder' },
  opts: FetchOpts = {}
): Promise<ApiRankingRow[]> {
  const qs = new URLSearchParams({ category: 'player', ...params });
  return apiGet<ApiRankingRow[]>(`/rankings/players?${qs}`, { revalidate: 3600, ...opts });
}

export interface ApiTeamRankingRow {
  /** Rating — points / matches, rounded the way the ICC publishes it. */
  r: number;
  /** Total rating points. */
  p: number;
  /** Matches counted in the rating period. */
  m: number;
  /** Team f_key. */
  tf: string;
}

/** Keyed by the upstream's format names — t20, not t20i. */
export type ApiTeamRankingsResponse = Partial<
  Record<'test' | 'odi' | 't20', ApiTeamRankingRow[]>
>;

/**
 * All three formats' team lists for one gender in one call (the upstream's rankingFront).
 * `/rankings/players?category=team` would take three, and comes back empty for women's T20.
 */
export function getApiTeamRankings(
  gender: 'men' | 'women',
  opts: FetchOpts = {}
): Promise<ApiTeamRankingsResponse> {
  const qs = new URLSearchParams({
    // Required by the route; the reply ignores it and sends all three formats.
    category: '0',
    gender: gender === 'women' ? '1' : '0',
    play: '0',
  });
  return apiGet<ApiTeamRankingsResponse>(`/rankings?${qs}`, { revalidate: 3600, ...opts });
}

/** One team list in full. rankingFront stops at ten, which leaves a Test nation off the men's Test list. */
export function getApiTeamRankingList(
  params: { type: 'test' | 'odi' | 't20'; gender: 'men' | 'women' },
  opts: FetchOpts = {}
): Promise<ApiTeamRankingRow[]> {
  const qs = new URLSearchParams({ category: 'team', play: 'team', ...params });
  return apiGet<ApiTeamRankingRow[]>(`/rankings/players?${qs}`, { revalidate: 3600, ...opts });
}
