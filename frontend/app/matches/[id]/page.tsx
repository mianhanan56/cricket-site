import { cache } from 'react';
import { notFound, redirect } from 'next/navigation';
import type { HeadToHead, PointsTableGroup, SeriesLeaders } from '@/types';
import {
  getApiFixtureRange,
  getApiMatch,
  getApiMatchSeriesSquads,
  getApiScheduledMatch,
  getApiSeriesLeaders,
  getApiSeriesTable,
  parseScheduledMatchId,
} from '../../../lib/api';
import { headToHead } from '../../../lib/headToHead';
import MatchDetail from '../../../components/match/MatchDetail';
import { VENUE_TBD } from '@/lib/venue';
import { pickParam } from '@/lib/queryParams';
import { MATCH_TAB_KEYS, type MatchTab } from '@/lib/tabs';
import { matchFormat } from '@/lib/seriesFormat';

// Freshness is set per-fetch below rather than with a page-level `revalidate`:
// making the route ISR-cached also caches the notFound() path, which turns an
// unknown id into a soft 404 — the not-found page served with a 200.
const REVALIDATE = 5;

// An upstream match key reads the live feed (or the archive); an `fx-` id is a fixture
// with no key yet, read from its series' schedule. cache(): generateMetadata and the
// page share one read per request.
const loadMatch = cache((id: string) =>
  parseScheduledMatchId(id) ? getApiScheduledMatch(id) : getApiMatch(id, { revalidate: REVALIDATE })
);

export async function generateMetadata({ params }: { params: { id: string } }) {
  const m = await loadMatch(params.id).catch(() => null);
  if (!m) return { title: 'Match Centre' };

  const year = new Date(m.startTime).getFullYear();
  const verb = m.status === 'LIVE' ? 'Live Score' : m.status === 'UPCOMING' ? 'Preview' : 'Result';
  return {
    title: `${m.homeTeam.shortName} vs ${m.awayTeam.shortName} ${verb} — ${matchFormat(m)} ${year}`,
    description: `${m.homeTeam.name} vs ${m.awayTeam.name}, ${m.series.name}. ${matchFormat(m)} ${verb.toLowerCase()}${m.venue === VENUE_TBD ? '' : ` at ${m.venue}`}.`,
  };
}

export default async function MatchDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { tab?: string | string[] };
}) {
  const preview = parseScheduledMatchId(params.id) !== null;
  // The corpus needs nothing from the match, so it is read while the match loads.
  const corpusRead = getApiFixtureRange().catch(() => null);
  const match = await loadMatch(params.id);
  if (!match) notFound();

  // Preview links outlive the preview: once the upstream allocates a key, send the reader to it.
  if (match.id !== params.id) redirect(`/matches/${match.id}`);

  // Head-to-head, standings, series squads (upcoming only — the floor under an
  // announced XI) and leaders: static for the life of the page, each on its own cache window.
  const [record, table, squads, leaders] = await Promise.all([
    corpusRead.then((corpus): HeadToHead | null =>
      corpus ? headToHead(match.homeTeam, match.awayTeam, corpus, { exclude: params.id }) : null
    ).catch(() => null),
    match.series.id
      ? getApiSeriesTable(match.series.id).catch(() => [] as PointsTableGroup[])
      : Promise.resolve([] as PointsTableGroup[]),
    match.status === 'UPCOMING' && !match.squads
      ? getApiMatchSeriesSquads(match).catch(() => null)
      : Promise.resolve(null),
    match.series.id
      ? getApiSeriesLeaders(match.series.id, { revalidate: match.status === 'LIVE' ? 15 : 300 }).catch(() => null)
      : Promise.resolve(null as SeriesLeaders | null),
  ]);

  return (
    <MatchDetail
      matchId={params.id}
      preview={preview}
      initial={squads ? { ...match, squads } : match}
      headToHead={record}
      seriesTable={table}
      seriesLeaders={leaders}
      initialTab={pickParam<MatchTab | ''>(searchParams?.tab, MATCH_TAB_KEYS, '')}
    />
  );
}
