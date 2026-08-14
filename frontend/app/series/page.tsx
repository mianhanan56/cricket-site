import type { Match } from '@/types';
import { pickParam } from '../../lib/queryParams';
import { MATCH_TYPE_KEYS, type MatchTypeKey } from '../../lib/matchType';
import { SERIES_STATUS_KEYS, type SeriesStatusKey } from '../../lib/tabs';
import { getCrexMatchList } from '../../lib/crex';
import SeriesFilter from '../../components/series/SeriesFilter';
import styles from './series.module.scss';

export const metadata = {
  title: 'Series',
  description: 'Live, upcoming and recently finished cricket series.',
};

// Series shift on the scale of a match result, not a ball, so this is
// server-rendered off the crex Worker and revalidated rather than polled like
// the home page.
export const revalidate = 300;

export default async function SeriesPage({
  searchParams,
}: {
  // Read here rather than with useSearchParams() in the client so the filtered
  // list stays in the HTML — same reasoning as /fixtures.
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const status = pickParam<SeriesStatusKey>(searchParams?.status, SERIES_STATUS_KEYS, 'all');
  const type = pickParam<MatchTypeKey>(searchParams?.type, MATCH_TYPE_KEYS, 'all');

  // The Worker has no series endpoint — a series is a rollup of the match list.
  // Matches are handed down raw and grouped in the client component, because the
  // international/domestic filter has to apply *before* the rollup: filtering
  // afterwards would keep a domestic league whose group happens to contain one
  // international fixture.
  let matches: Match[] = [];
  let failed = false;
  try {
    matches = await getCrexMatchList({ revalidate });
  } catch {
    failed = true;
  }

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.heading}>Series</h1>
        <p className={styles.sub}>
          Every competition currently in the feed, grouped from its matches.
        </p>
      </header>

      {failed ? (
        <p className={styles.empty}>Could not load series.</p>
      ) : (
        <SeriesFilter matches={matches} initialStatus={status} initialType={type} />
      )}
    </div>
  );
}
