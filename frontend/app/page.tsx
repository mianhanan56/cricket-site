import { pickParam } from '../lib/queryParams';
import { MATCH_TYPE_KEYS, type MatchTypeKey } from '../lib/matchType';
import { HOME_TAB_KEYS, type HomeTab } from '../lib/tabs';
import HomeMatches from '../components/home/HomeMatches';
import styles from './page.module.scss';

// No server-side data: matches and series are polled client-side in HomeMatches.
// It does read the active tab and type filter out of the URL, so a filtered
// home view is linkable (/?tab=upcoming&type=international). `tab` has no
// default: with none set the tab still follows the data (live > upcoming).
export default function HomePage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const tab = pickParam<HomeTab | ''>(searchParams?.tab, [...HOME_TAB_KEYS, ''], '');
  const type = pickParam<MatchTypeKey>(searchParams?.type, MATCH_TYPE_KEYS, 'all');

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Live cricket scores, fixtures and results</h1>
      <HomeMatches initialTab={tab} initialType={type} />
    </div>
  );
}
