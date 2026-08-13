import type { Match } from '@/types';
import { getCrexMatchList } from '../../lib/crex';
import FixturesFilter from '../../components/fixtures/FixturesFilter';
import styles from './fixtures.module.scss';

export const metadata = {
  title: 'Fixtures',
  description: 'Upcoming cricket fixtures by format.',
};

// Fixtures move on the scale of hours, not seconds, so this is server-rendered
// off the crex Worker and revalidated rather than polled like the home page.
export const revalidate = 300;

export default async function FixturesPage() {
  let fixtures: Match[] = [];
  let failed = false;
  try {
    // The Worker serves one list covering live, upcoming and recent matches;
    // fixtures are the upcoming slice of it.
    const all = await getCrexMatchList({ revalidate });
    fixtures = all.filter((m) => m.status === 'UPCOMING');
  } catch {
    failed = true;
  }

  // Sort by start date ascending (soonest first). getCrexMatchList hands back
  // newest-first, which is backwards for a fixtures list.
  fixtures.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Fixtures</h1>
      {failed ? (
        <p className={styles.empty}>Could not load fixtures.</p>
      ) : (
        <FixturesFilter fixtures={fixtures} />
      )}
    </div>
  );
}
