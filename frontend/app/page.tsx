import type { Match } from '@crex/shared';
import { getMatches } from '../lib/api';
import HomeMatches from '../components/home/HomeMatches';
import styles from './page.module.scss';

// Only surface completed matches from the last 48 hours on the homepage.
const COMPLETED_WINDOW_MS = 48 * 60 * 60 * 1000;
// "Finished" widens the net to every match completed in the last 7 days.
const FINISHED_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

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
  const finished = matches
    .filter(
      (m) => m.status === 'COMPLETED' && now - +new Date(m.startTime) <= FINISHED_WINDOW_MS,
    )
    .sort((a, b) => +new Date(b.startTime) - +new Date(a.startTime));

  return (
    <div className={styles.page}>
      {failed && (
        <div className={styles.notice}>
          Could not reach the API at <code>{process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000'}</code>.
          Start the backend with <code>npm run dev:backend</code>.
        </div>
      )}

      <HomeMatches live={live} upcoming={upcoming} recent={recentCompleted} finished={finished} />
    </div>
  );
}
