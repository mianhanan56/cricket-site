import { pageMeta } from '@/lib/seo';
import type { Match, SeriesSummary } from '@/types';
import { getApiMatchList, seriesFromMatches, withSeriesSchedules } from '../../lib/api';
import SeriesFilter from '../../components/series/SeriesFilter';
import EmptyState from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/Section';
import styles from './series.module.scss';

export const metadata = pageMeta({
  title: 'Cricket Series — Live, Upcoming & Recent',
  description:
    'Every live, upcoming and recently finished cricket series and tournament — international tours, T20 leagues and domestic competitions, with fixtures and results.',
  path: '/series',
});

// Series move on the scale of a result, not a ball: revalidated, not polled.
export const revalidate = 300;

const EYEBROW = 'Competitions';
const TITLE = 'Series';

// Static: status and type filters are read from the URL in the browser (SeriesFilter).
export default async function SeriesPage() {
  // Matches go down raw: the type filter must apply before the series rollup,
  // or a domestic league with one international fixture would survive it.
  let matches: Match[] = [];
  let failed = false;
  try {
    matches = await getApiMatchList({ revalidate });
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
      {failed ? (
        <>
          <PageHeader eyebrow={EYEBROW} title={TITLE} />
          <EmptyState icon="trophy" title="Could not load series" action={{ label: 'Try again', href: '/series' }} />
        </>
      ) : (
        <SeriesFilter
          eyebrow={EYEBROW}
          title={TITLE}
          matches={matches}
          totals={totals}
        />
      )}
    </div>
  );
}
