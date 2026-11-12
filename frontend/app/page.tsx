import type { Match } from '@/types';
import { getApiMatchList } from '../lib/api';
import { pickParam } from '../lib/queryParams';
import { HOME_DESCRIPTION, HOME_TITLE, pageMeta } from '../lib/seo';
import { MATCH_TYPE_KEYS, type MatchTypeKey } from '../lib/matchType';
import { HOME_TAB_KEYS, type HomeTab } from '../lib/tabs';
import { Suspense } from 'react';
import HomeMatches from '../components/home/HomeMatches';
import TopStories, { TopStoriesSkeleton } from '../components/home/TopStories';
import styles from './page.module.scss';

export const metadata = pageMeta({ title: HOME_TITLE, absoluteTitle: true, description: HOME_DESCRIPTION, path: '/' });

// The first match list comes with the page so crawlers see the matches and their links; the
// client poll takes over from it. The active tab and type filter are read out of the URL, so a filtered
// home view is linkable (/?tab=upcoming&type=international). `tab` has no
// default: with none set the tab still follows the data (live > upcoming).
export default async function HomePage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await props.searchParams;
  const tab = pickParam<HomeTab | ''>(searchParams?.tab, [...HOME_TAB_KEYS, ''], '');
  const type = pickParam<MatchTypeKey>(searchParams?.type, MATCH_TYPE_KEYS, 'all');
  const initialMatches: Match[] = await getApiMatchList({ revalidate: 15 }).catch(() => []);

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Live cricket scores, fixtures and results</h1>
      <HomeMatches
        initialTab={tab}
        initialType={type}
        initialMatches={initialMatches}
        news={
          <Suspense fallback={<TopStoriesSkeleton />}>
            <TopStories />
          </Suspense>
        }
      />
    </div>
  );
}
