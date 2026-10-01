import { pickParam } from '@/lib/queryParams';
import { MATCH_TYPE_KEYS, type MatchTypeKey } from '@/lib/matchType';
import { FIXTURE_FORMAT_KEYS, type FixtureFormatKey } from '@/lib/tabs';
import { dayKeyOf, pickDayParam } from '@/lib/fixtureDays';
import { getCrexFixtureSchedule, type Fixture } from '@/lib/crex';
import FixturesFilter from '@/components/fixtures/FixturesFilter';
import EmptyState from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/Section';
import styles from './fixtures.module.scss';

export const metadata = {
  title: 'Fixtures',
  description: 'Upcoming cricket fixtures by format.',
};

export const revalidate = 300;

export default async function FixturesPage({
  searchParams,
}: {
  // Read here rather than with useSearchParams() so the filtered list stays in the HTML.
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const format = pickParam<FixtureFormatKey>(searchParams?.format, FIXTURE_FORMAT_KEYS, 'all');
  const type = pickParam<MatchTypeKey>(searchParams?.type, MATCH_TYPE_KEYS, 'all');
  const date = pickDayParam(searchParams?.date);

  let fixtures: Fixture[] = [];
  let coveredUntil: string | null = null;
  let failed = false;
  try {
    // The schedule endpoint, not the live feed — the feed is only two or three days deep.
    const schedule = await getCrexFixtureSchedule({ revalidate });
    fixtures = schedule.fixtures.filter((m) => m.status === 'UPCOMING');
    coveredUntil = schedule.coveredUntil;
  } catch {
    failed = true;
  }

  return (
    <div className={styles.page}>
      <PageHeader eyebrow="Every match" title="Fixtures" />
      {failed ? (
        <EmptyState
          icon="calendar"
          title="Fixtures could not be loaded"
          action={{ label: 'Try again', href: '/fixtures' }}
          secondary={{ label: 'Live matches', href: '/' }}
        />
      ) : (
        <FixturesFilter
          fixtures={fixtures}
          coveredUntil={coveredUntil}
          initialFormat={format}
          initialType={type}
          initialDate={date}
          // The client re-derives today for its own timezone on mount.
          serverToday={dayKeyOf(new Date())}
        />
      )}
    </div>
  );
}
