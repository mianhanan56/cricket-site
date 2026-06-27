import type { Match } from '@crex/shared';
import { getMatches } from '../lib/api';
import MatchSlider from '../components/home/MatchSlider';
import styles from './page.module.scss';

// Only surface completed matches from the last 48 hours on the homepage.
const COMPLETED_WINDOW_MS = 48 * 60 * 60 * 1000;

// Server Component — fetches on the server and streams HTML.
export default async function HomePage() {
  let matches: Match[] = [];
  let failed = false;

  try {
    matches = await getMatches();
  } catch {
    failed = true;
  }

  const now = Date.now();
  const live = matches.filter((m) => m.status === 'LIVE');
  const upcoming = matches
    .filter((m) => m.status === 'UPCOMING')
    .sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime));
  const recentCompleted = matches
    .filter(
      (m) => m.status === 'COMPLETED' && now - +new Date(m.startTime) <= COMPLETED_WINDOW_MS,
    )
    .sort((a, b) => +new Date(b.startTime) - +new Date(a.startTime));

  const recentAndUpcoming = [...upcoming, ...recentCompleted];

  return (
    <div className={styles.page}>
      {failed && (
        <div className={styles.notice}>
          Could not reach the API at <code>{process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000'}</code>.
          Start the backend with <code>npm run dev:backend</code>.
        </div>
      )}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Live Now</h2>
        {live.length ? (
          <MatchSlider matches={live} autoScroll />
        ) : (
          <p className={styles.emptyState}>No live matches right now.</p>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Recent &amp; Upcoming</h2>
          <a href="/matches" className={styles.seeAll}>
            See all →
          </a>
        </div>
        {recentAndUpcoming.length ? (
          <MatchSlider matches={recentAndUpcoming} />
        ) : (
          <p className={styles.emptyState}>No recent or upcoming matches.</p>
        )}
      </section>
    </div>
  );
}
