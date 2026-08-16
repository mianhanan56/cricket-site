import { pickParam } from '../../lib/queryParams';
import { MATCH_TYPE_KEYS, type MatchTypeKey } from '../../lib/matchType';
import { FIXTURE_FORMAT_KEYS, type FixtureFormatKey } from '../../lib/tabs';
import { dayKeyOf, pickDayParam } from '../../lib/fixtureDays';
import { getCrexFixtureList, type Fixture } from '../../lib/crex';
import FixturesFilter from '../../components/fixtures/FixturesFilter';
import styles from './fixtures.module.scss';

export const metadata = {
  title: 'Fixtures',
  description: 'Upcoming cricket fixtures by format.',
};

// Fixtures move on the scale of hours, not seconds, so this is server-rendered
// off the crex Worker and revalidated rather than polled like the home page.
export const revalidate = 300;

export default async function FixturesPage({
  searchParams,
}: {
  // The active tab and type arrive in the URL. Reading them here rather than
  // with useSearchParams() in the client keeps the filtered list in the HTML —
  // a client read would push the whole page behind a Suspense shell.
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const format = pickParam<FixtureFormatKey>(searchParams?.format, FIXTURE_FORMAT_KEYS, 'all');
  const type = pickParam<MatchTypeKey>(searchParams?.type, MATCH_TYPE_KEYS, 'all');
  // A free-form value rather than one of a fixed set, so it gets its own
  // validator: anything that is not a "2026-08-20" reads as the unfiltered view.
  const date = pickDayParam(searchParams?.date);

  let fixtures: Fixture[] = [];
  let failed = false;
  try {
    // crex's schedule endpoint, not the live feed: the feed is a rolling window
    // two or three days deep, which is what made this page look half-empty.
    // getCrexFixtureList already hands back soonest-first.
    const all = await getCrexFixtureList({ revalidate });
    fixtures = all.filter((m) => m.status === 'UPCOMING');
  } catch {
    failed = true;
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Fixtures</h1>
      {failed ? (
        <p className={styles.empty}>Could not load fixtures.</p>
      ) : (
        <FixturesFilter
          fixtures={fixtures}
          initialFormat={format}
          initialType={type}
          initialDate={date}
          // The server's own today, so the first paint says "Today" instead of a
          // bare date. The client re-derives it for its own timezone on mount.
          serverToday={dayKeyOf(new Date())}
        />
      )}
    </div>
  );
}
