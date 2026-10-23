import { pickParam } from '../lib/queryParams';
import { MATCH_TYPE_KEYS, type MatchTypeKey } from '../lib/matchType';
import { HOME_TAB_KEYS, type HomeTab } from '../lib/tabs';
import { Suspense } from 'react';
import HomeMatches from '../components/home/HomeMatches';
import TopStories, { TopStoriesSkeleton } from '../components/home/TopStories';
import styles from './page.module.scss';

// Matches and series are polled client-side in HomeMatches; only the news streams from the server.
// The active tab and type filter are read out of the URL, so a filtered
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
      <HomeMatches
        initialTab={tab}
        initialType={type}
        news={
          <Suspense fallback={<TopStoriesSkeleton />}>
            <TopStories />
          </Suspense>
        }
      />
    </div>
  );
}
