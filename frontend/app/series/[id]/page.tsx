import { Suspense, cache } from 'react';
import { notFound } from 'next/navigation';
import type { Match } from '@/types';
import {
  getApiMatchList,
  getApiSeriesLeaders,
  getApiSeriesSchedule,
  getApiSeriesTable,
  seriesScheduleFromMatches,
  withFeedStatuses,
  type SeriesSchedule,
  type SeriesScheduleMatch,
} from '../../../lib/api';
import { pickParam } from '../../../lib/queryParams';
import { seriesFormatPhrase } from '../../../lib/seriesFormat';
import { getTaggedNews } from '../../../lib/news';
import PointsTable from '../../../components/series/PointsTable';
import { rankedLeaders } from '../../../components/series/SeriesLeaders';
import { LiveLeaderFigures, LiveLeadersBoard } from '../../../components/series/LiveLeaders';
import SeriesTabs, { type SeriesTab } from '../../../components/series/SeriesTabs';
import { ProgressRail, seriesSpan, seriesState } from '../../../components/series/SeriesCard';
import UpcomingRail from '../../../components/home/UpcomingRail';
import ResultList from '../../../components/home/ResultList';
import StateChip from '../../../components/live/StateChip';
import LiveSeriesTiles from '../../../components/series/LiveSeriesTiles';
import SeriesMatchStrip from '../../../components/series/SeriesMatchStrip';
import SeriesMilestones, { MilestonesSkeleton } from '../../../components/series/SeriesMilestones';
import FollowButton from '../../../components/follow/FollowButton';
import { NewsGrid } from '../../../components/news/NewsList';
import EmptyState from '../../../components/ui/EmptyState';
import BackButton from '../../../components/ui/BackButton';
import { PageHeader, SectionHead } from '../../../components/ui/Section';
import styles from './seriesDetail.module.scss';

// Freshness is per-fetch rather than a page-level `revalidate`: ISR would also
// cache the notFound() path and turn an unknown id into a soft 404.
const REVALIDATE = 300;
const LIVE_REVALIDATE = 15;

const TAB_KEYS = ['matches', 'table', 'stats', 'news'] as const;
type TabKey = (typeof TAB_KEYS)[number];

const UPCOMING_FIRST = 10;
const RESULTS_FIRST = 8;

// cache(): generateMetadata and the page share one read per request; each attaches its own catch.
const readSchedule = cache((id: string): Promise<SeriesSchedule | null> => getApiSeriesSchedule(id, { revalidate: REVALIDATE }));

export async function generateMetadata({ params }: { params: { id: string } }) {
  const series = await readSchedule(params.id).catch(() => null);
  if (!series) return { title: 'Series' };

  return {
    title: `${series.name} — Fixtures & Results`,
    description: `All ${series.matchCount} ${seriesFormatPhrase(series)} ${
      series.matchCount === 1 ? 'match' : 'matches'
    } in ${series.name}: fixtures, live scores and results.`,
  };
}

// The schedule carries no scores; a feed match (when the feed has it) does.
function toMatch(row: SeriesScheduleMatch, series: { id: string; name: string }): Match {
  const n = Number(row.matchNo);
  return {
    id: row.id,
    homeTeam: row.homeTeam,
    awayTeam: row.awayTeam,
    series,
    format: row.format,
    status: row.status,
    venue: row.venue,
    venueId: row.venueId,
    startTime: row.startTime,
    result: row.result,
    matchNumber: Number.isInteger(n) ? n : null,
    stage: Number.isInteger(n) ? null : row.matchNo,
  };
}

function More({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details className={styles.more}>
      <summary className={styles.moreSummary}>{label}</summary>
      <div className={styles.moreBody}>{children}</div>
    </details>
  );
}

export default async function SeriesDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const feedRead = getApiMatchList({ revalidate: LIVE_REVALIDATE }).catch(() => [] as Match[]);
  let scheduleError: unknown = null;
  const [schedule, feed, table, leaders, news] = await Promise.all([
    readSchedule(params.id).catch((err) => {
      scheduleError = err;
      return null;
    }),
    feedRead,
    // Empty for a bilateral tour; the standings section is then absent.
    getApiSeriesTable(params.id, { revalidate: REVALIDATE }).catch(() => []),
    // Leaders move by the ball while one of the series' matches is in play.
    feedRead.then((list) =>
      getApiSeriesLeaders(params.id, {
        revalidate: list.some((m) => m.series.id === params.id && m.status === 'LIVE') ? LIVE_REVALIDATE : REVALIDATE,
      }).catch(() => null)
    ),
    getTaggedNews('series', params.id),
  ]);

  // Schedule endpoint down: fall back to the feed's narrower view before 404-ing.
  const base = schedule ?? seriesScheduleFromMatches(params.id, feed);
  if (!base) {
    // An unknown series reads back as null; a thrown read is an outage, not a 404.
    if (scheduleError) throw scheduleError;
    notFound();
  }

  const series = withFeedStatuses(base, feed);
  const ref = { id: series.id, name: series.name };
  const span = seriesSpan(series.startDate, series.endDate);

  const feedById = new Map(feed.map((m) => [m.id, m]));
  // Rendered with no ball feed to check a break against, and the upstream latches them for
  // hours — so a paused note is dropped and the card says only what the status proves.
  const verifiable = (m: Match): Match => (m.note?.paused ? { ...m, note: null } : m);
  const asMatch = (row: SeriesScheduleMatch) => verifiable(feedById.get(row.id) ?? toMatch(row, ref));

  const liveRows = series.matches.filter((m) => m.status === 'LIVE');
  const upcoming = series.matches.filter((m) => m.status === 'UPCOMING').map(asMatch);
  const results = series.matches
    .filter((m) => m.status === 'COMPLETED')
    .reverse()
    .map(asMatch);
  const live = liveRows.map(asMatch);
  const total = series.matches.length || series.matchCount;
  const played = results.length;
  // A tour can run Tests and ODIs; one format label would misname half of it.
  const formats = [...new Set(series.matches.map((m) => m.format).filter(Boolean))];

  const shownLeaders = leaders ? rankedLeaders(leaders) : [];
  const topRuns = shownLeaders.find((l) => l.kind === 'RUNS');
  const topWickets = shownLeaders.find((l) => l.kind === 'WICKETS');
  const hasFigures = Boolean(topRuns || topWickets);

  const tabs: SeriesTab[] = [
    { key: 'matches', label: 'Matches', count: series.matchCount },
    ...(table.length > 0 ? [{ key: 'table', label: 'Points table', count: table.length > 1 ? table.length : null }] : []),
    ...(shownLeaders.length > 0 ? [{ key: 'stats', label: 'Top performers' }] : []),
    ...(news.length > 0 ? [{ key: 'news', label: 'News' }] : []),
  ];

  // A tab this series has no section for falls back rather than 404-ing.
  const requested = pickParam<TabKey>(searchParams?.tab, TAB_KEYS, 'matches');
  const tab = tabs.some((t) => t.key === requested) ? requested : 'matches';

  return (
    <div className={styles.page}>
      <BackButton fallback="/series" className={styles.back} />

      <PageHeader
        eyebrow={`${seriesFormatPhrase(series)} series`}
        title={series.name}
        aside={<FollowButton kind="series" entity={ref} />}
      >
        <div className={styles.meta}>
          <StateChip state={seriesState(series.status)} />
          <span className={styles.dates}>
            {span.oneDay ? (
              <time dateTime={series.startDate}>{span.end}</time>
            ) : (
              <>
                <time dateTime={series.startDate}>{span.start}</time>
                <span aria-hidden="true"> → </span>
                <time dateTime={series.endDate}>{span.end}</time>
              </>
            )}
          </span>
        </div>
      </PageHeader>

      <section className={styles.control} data-figures={hasFigures || undefined} aria-label="Tournament progress">
        <div className={styles.progress}>
          <div className={styles.readoutRow}>
            <div className={styles.readout}>
              <span className={styles.label}>Played</span>
              <span className={styles.big}>
                {played}
                <span className={styles.of}>/{total}</span>
              </span>
            </div>
            <dl className={styles.counts}>
              {live.length > 0 && (
                <div data-kind="live">
                  <dt>Live</dt>
                  <dd>{live.length}</dd>
                </div>
              )}
              <div>
                <dt>To play</dt>
                <dd>{upcoming.length}</dd>
              </div>
            </dl>
          </div>

          <ProgressRail played={played} total={total} live={live.length > 0} className={styles.rail} />

          {series.matches.length > 0 && (
            <SeriesMatchStrip matches={series.matches} multiFormat={formats.length > 1} />
          )}
        </div>

        {hasFigures && leaders && (
          <LiveLeaderFigures seriesId={series.id} initial={leaders} live={live.length > 0} className={styles.figures} />
        )}
      </section>

      <SeriesTabs base={`/series/${series.id}`} tabs={tabs} active={tab} />

      {tab === 'matches' && (
        <div className={styles.sections}>
          {live.length > 0 && (
            <section>
              <SectionHead title="Live now" count={live.length} level={3} />
              <LiveSeriesTiles matches={live} className={styles.grid} />
            </section>
          )}

          <div className={styles.split} data-single={upcoming.length === 0 || results.length === 0 || undefined}>
            {upcoming.length > 0 && (
              <section>
                <SectionHead title="Coming up" count={upcoming.length} level={3} />
                <UpcomingRail matches={upcoming.slice(0, UPCOMING_FIRST)} inSeries />
                {upcoming.length > UPCOMING_FIRST && (
                  <More label={`${upcoming.length - UPCOMING_FIRST} more fixtures`}>
                    <UpcomingRail matches={upcoming.slice(UPCOMING_FIRST)} inSeries />
                  </More>
                )}
              </section>
            )}

            {results.length > 0 && (
              <section>
                <SectionHead title="Results" count={results.length} level={3} />
                <ResultList matches={results.slice(0, RESULTS_FIRST)} inSeries />
                {results.length > RESULTS_FIRST && (
                  <More label={`${results.length - RESULTS_FIRST} earlier results`}>
                    <ResultList matches={results.slice(RESULTS_FIRST)} inSeries />
                  </More>
                )}
              </section>
            )}
          </div>

          {upcoming.length === 0 && results.length === 0 && live.length === 0 && (
            <EmptyState icon="calendar" title="No matches listed yet" action={{ label: 'All series', href: '/series' }} />
          )}
        </div>
      )}

      {tab === 'table' && (
        <section>
          <SectionHead title="Standings" count={table.length > 1 ? table.length : undefined} level={3} />
          <PointsTable groups={table} />
        </section>
      )}

      {tab === 'stats' && leaders && (
        <section>
          <SectionHead title="Top performers" level={3} />
          <LiveLeadersBoard seriesId={series.id} initial={leaders} live={live.length > 0}>
            <Suspense fallback={<MilestonesSkeleton />}>
              <SeriesMilestones seriesId={series.id} />
            </Suspense>
          </LiveLeadersBoard>
        </section>
      )}

      {tab === 'news' && (
        <section>
          <SectionHead title="News" count={news.length} level={3} />
          <NewsGrid articles={news} />
        </section>
      )}
    </div>
  );
}
