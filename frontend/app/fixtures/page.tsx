import type { Match } from '@crex/shared';
import { getFixtures } from '../../lib/api';
import FixturesFilter from '../../components/fixtures/FixturesFilter';
import styles from './fixtures.module.scss';

export const metadata = {
  title: 'Fixtures',
  description: 'Upcoming cricket fixtures by format.',
};

export default async function FixturesPage() {
  let fixtures: Match[] = [];
  let failed = false;
  try {
    fixtures = await getFixtures();
  } catch {
    failed = true;
  }

  // Sort by start date ascending (soonest first).
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
