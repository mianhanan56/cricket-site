import { cache } from 'react';
import { notFound, permanentRedirect } from 'next/navigation';
import type { HeadToHead, PointsTableGroup, SeriesLeaders } from '@/types';
import {
  getApiFixtureRange,
  getApiMatch,
  getApiMatchSeriesSquads,
  getApiScheduledMatch,
  getApiScorecard,
  getApiSeriesLeaders,
  getApiSeriesTable,
  parseScheduledMatchId,
} from '../../../lib/api';
import { headToHead } from '../../../lib/headToHead';
import MatchDetail from '../../../components/match/MatchDetail';
import { VENUE_TBD } from '@/lib/venue';
import { pickParam } from '@/lib/queryParams';
import { MATCH_TAB_KEYS, type MatchTab } from '@/lib/tabs';
import { matchOrdinal } from '@/lib/seriesFormat';
import { pageMeta } from '@/lib/seo';
import JsonLd from '@/components/seo/JsonLd';
import { breadcrumbs, sportsEvent } from '@/lib/structuredData';

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

  const fixture = `${m.homeTeam.name} vs ${m.awayTeam.name}`;
  const which = m.stage ?? matchOrdinal(m);
  const at = m.venue === VENUE_TBD ? '' : ` at ${m.venue}`;
  const verb = m.status === 'LIVE' ? 'Live Score' : m.status === 'UPCOMING' ? 'Preview' : 'Result & Scorecard';
  const lead =
    m.status === 'COMPLETED'
      ? `${fixture}, ${which}, ${m.series.name}${at}.${m.result ? ` ${m.result}.` : ''} Full scorecard and ball-by-ball commentary.`
      : m.status === 'LIVE'
        ? `${fixture} live score, ${which}, ${m.series.name}${at}. Ball-by-ball commentary, scorecard and win probability.`
        : `${fixture}, ${which}, ${m.series.name}${at}. Preview, squads, head-to-head record and live score once play starts.`;

  return pageMeta({
    title: `${fixture} ${verb}, ${which} — ${m.series.name}`,
    description: lead,
    path: `/matches/${m.id}`,
    images: 'segment',
  });
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
  if (match.id !== params.id) permanentRedirect(`/matches/${match.id}`);

  // Head-to-head, standings, series squads (upcoming only — the floor under an
  // announced XI) and leaders: static for the life of the page, each on its own cache window.
  // A finished card is final, so it's read here and cached: the first HTML then carries every batter and bowler.
  const [record, table, squads, leaders, card] = await Promise.all([
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
    match.status === 'COMPLETED' && !preview
      ? getApiScorecard(match.id, { revalidate: 3600, ballsPerOver: match.ballsPerOver, status: match.status }).catch(
          () => null
        )
      : Promise.resolve(null),
  ]);

  const crumbs = [
    ...(match.series.id ? [{ name: match.series.name, path: `/series/${match.series.id}` }] : []),
    { name: `${match.homeTeam.shortName} vs ${match.awayTeam.shortName}`, path: `/matches/${match.id}` },
  ];

  return (
    <>
      <JsonLd data={[sportsEvent(match), breadcrumbs(crumbs)]} />
      <MatchDetail
        matchId={params.id}
        preview={preview}
        initial={squads ? { ...match, squads } : match}
        headToHead={record}
        seriesTable={table}
        seriesLeaders={leaders}
        initialTab={pickParam<MatchTab | ''>(searchParams?.tab, MATCH_TAB_KEYS, '')}
        initialCard={card?.length ? card : null}
      />
    </>
  );
}
