import type { Match } from '@/types';
import { seriesFromMatches } from './crex';

export interface Suggestion {
  id: string;
  name: string;
}

// Knockout fixtures list their sides before anyone has qualified.
const PLACEHOLDER = /^(tb[acd]|to be|winner|loser|qualifier)\b/i;

const byStart = (a: Match, b: Match) => +new Date(a.startTime) - +new Date(b.startTime);

/** Sides playing now, then those with a match coming, then the rest of any series still running. */
export function activeTeams(matches: Match[], limit: number): Suggestion[] {
  const running = new Set(seriesFromMatches(matches).filter((s) => s.status === 'LIVE').map((s) => s.id));
  const ordered = [
    ...matches.filter((m) => m.status === 'LIVE'),
    ...matches.filter((m) => m.status === 'UPCOMING').sort(byStart),
    ...matches.filter((m) => m.status === 'COMPLETED' && running.has(m.series.id)).sort((a, b) => byStart(b, a)),
  ];
  const seen = new Map<string, Suggestion>();
  for (const m of ordered) {
    for (const t of [m.homeTeam, m.awayTeam]) {
      if (t.id && t.name && !PLACEHOLDER.test(t.name) && !seen.has(t.id)) seen.set(t.id, { id: t.id, name: t.name });
    }
    if (seen.size >= limit) break;
  }
  return [...seen.values()].slice(0, limit);
}

/** Series with a match on now, then running, then starting soonest, then the most recently finished. */
export function activeSeries(matches: Match[], limit: number): Suggestion[] {
  const onNow = new Set(matches.filter((m) => m.status === 'LIVE').map((m) => m.series.id));
  const all = seriesFromMatches(matches);
  const finished = all.filter((s) => s.status === 'COMPLETED').sort((a, b) => +new Date(b.endDate) - +new Date(a.endDate));
  return [
    ...all.filter((s) => onNow.has(s.id)),
    ...all.filter((s) => s.status === 'LIVE' && !onNow.has(s.id)),
    ...all.filter((s) => s.status === 'UPCOMING' && !onNow.has(s.id)),
    ...finished.filter((s) => !onNow.has(s.id)),
  ]
    .slice(0, limit)
    .map((s) => ({ id: s.id, name: s.name }));
}
