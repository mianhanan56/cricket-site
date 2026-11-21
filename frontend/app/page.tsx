import type { Match } from '@/types';
import { getApiMatchList } from '../lib/api';
import { HOME_DESCRIPTION, HOME_TITLE, pageMeta } from '../lib/seo';
import HomeMatches from '../components/home/HomeMatches';
import styles from './page.module.scss';

export const metadata = pageMeta({ title: HOME_TITLE, absoluteTitle: true, description: HOME_DESCRIPTION, path: '/' });

// Static and revalidated: the client poll takes over the list on mount, so the HTML only
// needs to be fresh enough for crawlers. Tab and type filters are read from the URL in the browser.
export const revalidate = 60;

export default async function HomePage() {
  // The first match list comes with the page so crawlers see the matches and their links.
  const initialMatches: Match[] = await getApiMatchList({ revalidate }).catch(() => []);

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Live cricket scores, fixtures and results</h1>
      <HomeMatches initialMatches={initialMatches} />
    </div>
  );
}
