import type { Match, SeriesSummary } from '@/types';
import { pickParam } from '../../lib/queryParams';
import { MATCH_TYPE_KEYS, type MatchTypeKey } from '../../lib/matchType';
import { SERIES_STATUS_KEYS, type SeriesStatusKey } from '../../lib/tabs';
import { getCrexMatchList, seriesFromMatches, withSeriesSchedules } from '../../lib/crex';
import SeriesFilter from '../../components/series/SeriesFilter';
import EmptyState from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/Section';
import styles from './series.module.scss';

export const metadata = {
  title: 'Series',
  description: 'Live, upcoming and recently finished cricket series.',
};

// Series move on the scale of a result, not a ball: revalidated, not polled.
export const revalidate = 300;

export default async function SeriesPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const status = pickParam<SeriesStatusKey>(searchParams?.status, SERIES_STATUS_KEYS, 'all');
  const type = pickParam<MatchTypeKey>(searchParams?.type, MATCH_TYPE_KEYS, 'all');

  // Matches go down raw: the type filter must apply before the series rollup,
  // or a domestic league with one international fixture would survive it.
  let matches: Match[] = [];
  let failed = false;
  try {
    matches = await getCrexMatchList({ revalidate });
  } catch {
    failed = true;
  }

  // The feed only carries a window of each series, so spans and totals come from
  // each series' own schedule, keyed by id for the client to merge back.
  const totals: Record<string, SeriesSummary> = Object.fromEntries(
    (await withSeriesSchedules(seriesFromMatches(matches), matches, { revalidate })).map((s) => [s.id, s])
  );

  return (
    <div className={styles.page}>
      <PageHeader eyebrow="Competitions" title="Series" />

      {failed ? (
        <EmptyState icon="trophy" title="Could not load series" action={{ label: 'Try again', href: '/series' }} />
      ) : (
        <SeriesFilter matches={matches} totals={totals} initialStatus={status} initialType={type} />
      )}
    </div>
  );
}
