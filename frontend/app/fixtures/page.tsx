import { pageMeta } from '@/lib/seo';
import { dayKeyIn } from '@/lib/fixtureDays';
import { SERVER_ZONE } from '@/lib/datetime';
import { getApiFixtureSchedule, type Fixture } from '@/lib/api';
import { packFixtures } from '@/lib/fixturePack';
import FixturesFilter from '@/components/fixtures/FixturesFilter';
import EmptyState from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/Section';
import styles from './fixtures.module.scss';

export const metadata = pageMeta({
  title: 'Cricket Fixtures & Schedule',
  description:
    'Upcoming cricket fixtures for the next month — Test, ODI and T20I internationals, T20 leagues and domestic cricket, with dates, start times and venues.',
  path: '/fixtures',
});

export const revalidate = 300;

const EYEBROW = 'Every match';
const TITLE = 'Fixtures';

// Static: filters are read from the URL in the browser (FixturesFilter), so every request is not a render.
export default async function FixturesPage() {
  let fixtures: Fixture[] = [];
  let coveredUntil: string | null = null;
  let failed = false;
  try {
    // The schedule endpoint, not the live feed — the feed is only two or three days deep.
    const schedule = await getApiFixtureSchedule({ revalidate });
    fixtures = schedule.fixtures.filter((m) => m.status === 'UPCOMING');
    coveredUntil = schedule.coveredUntil;
  } catch {
    failed = true;
  }

  return (
    <div className={styles.page}>
      {failed ? (
        <>
          <PageHeader eyebrow={EYEBROW} title={TITLE} />
          <EmptyState
            icon="calendar"
            title="Fixtures could not be loaded"
            action={{ label: 'Try again', href: '/fixtures' }}
            secondary={{ label: 'Live matches', href: '/' }}
          />
        </>
      ) : (
        <FixturesFilter
          eyebrow={EYEBROW}
          title={TITLE}
          fixtures={packFixtures(fixtures)}
          coveredUntil={coveredUntil}
          serverToday={dayKeyIn(new Date(), SERVER_ZONE)}
        />
      )}
    </div>
  );
}
