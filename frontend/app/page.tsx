import HomeMatches from '../components/home/HomeMatches';
import styles from './page.module.scss';

// The home page has no server-side data of its own. Matches and series come
// from the crex Worker, polled client-side in HomeMatches — see lib/crex.ts.
// Nothing here talks to our Express backend, so the page renders regardless of
// whether that backend is up.
export default function HomePage() {
  return (
    <div className={styles.page}>
      <HomeMatches />
    </div>
  );
}
