import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { notFound, permanentRedirect } from 'next/navigation';
import type { HeadToHead, PointsTableGroup, SeriesLeaders, Team } from '@/types';
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
import { matchOrdinal } from '@/lib/seriesFormat';
import { pageMeta } from '@/lib/seo';
import JsonLd from '@/components/seo/JsonLd';
import { breadcrumbs, sportsEvent } from '@/lib/structuredData';

// No paths at build time: each is rendered on its first visit, then served from cache until it revalidates.
export function generateStaticParams() {
  return [];
}

// The page is ISR: it re-renders at most once per window however many readers are on it.
// The client poll takes over the score on mount, so the HTML only seeds it.
const REVALIDATE = 30;

// The corpus is 58 schedule pages; parsing and walking it per render was the page's main CPU cost.
// Thrown when empty so an outage is not held; a short window so a partly failed read heals soon.
const cachedHeadToHead = unstable_cache(
  async (home: Team, away: Team, exclude: string): Promise<HeadToHead | null> => {
    const corpus = await getApiFixtureRange();
    if (!corpus.length) throw new Error('fixture corpus empty');
    return headToHead(home, away, corpus, { exclude });
  },
  ['match-head-to-head'],
  { revalidate: 600 }
);

// An `fx-` id is a fixture with no key yet, read from its series' schedule. cache(): metadata and page share one read.
const loadMatch = cache((id: string) =>
  parseScheduledMatchId(id) ? getApiScheduledMatch(id) : getApiMatch(id, { revalidate: REVALIDATE })
);

export async function generateMetadata(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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

export default async function MatchDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const params = await props.params;
  const preview = parseScheduledMatchId(params.id) !== null;
  // Null only when the upstream refuses the key; an outage throws to app/error.tsx instead of a 404.
  const match = await loadMatch(params.id);
  if (!match) notFound();

  // Preview links outlive the preview: once the upstream allocates a key, send the reader to it.
  if (match.id !== params.id) permanentRedirect(`/matches/${match.id}`);

  // Head-to-head, standings, series squads (upcoming only — the floor under an
  // announced XI) and leaders: static for the life of the page, each on its own cache window.
  // A finished card is final, so it's read here and cached: the first HTML then carries every batter and bowler.
  const [record, table, squads, leaders, card] = await Promise.all([
    cachedHeadToHead(match.homeTeam, match.awayTeam, params.id).catch(() => null),
    match.series.id
      ? getApiSeriesTable(match.series.id).catch(() => [] as PointsTableGroup[])
      : Promise.resolve([] as PointsTableGroup[]),
    match.status === 'UPCOMING' && !match.squads
      ? getApiMatchSeriesSquads(match).catch(() => null)
      : Promise.resolve(null),
    match.series.id
      ? getApiSeriesLeaders(match.series.id, { revalidate: match.status === 'LIVE' ? REVALIDATE : 300 }).catch(() => null)
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
        initialCard={card?.length ? card : null}
      />
    </>
  );
}
