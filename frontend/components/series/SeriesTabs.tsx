import Link from 'next/link';
import styles from './SeriesTabs.module.scss';

export interface SeriesTab {
  key: string;
  label: string;
  /** Row count where one is worth previewing — 34 matches, 2 groups. */
  count?: number | null;
}

/**
 * Section rail for a series page: matches, points table, stats.
 *
 * Links rather than buttons, driven by `?tab=`, for the reason the rest of this
 * app reads its filters off the URL: each section stays server-rendered, so the
 * standings and the honours board are in the HTML for a crawler and survive a
 * shared link. It also costs nothing on a phone — no client bundle for a nav.
 *
 * Mirrors the match page's rail deliberately (sticky, underlined active tab)
 * rather than inventing a second tab language: a reader moving between a match
 * and the series it belongs to should not have to learn two.
 */
export default function SeriesTabs({
  base,
  tabs,
  active,
}: {
  /** Path the tabs link to, without the query — `/series/2AW`. */
  base: string;
  tabs: SeriesTab[];
  active: string;
}) {
  // One section is not a choice; the rail would be furniture around a single
  // heading. A bilateral tour with no table and no leaders lands here.
  if (tabs.length < 2) return null;

  return (
    <nav className={styles.tabs} aria-label="Series sections">
      {tabs.map((tab) => {
        const current = tab.key === active;

        return (
          <Link
            key={tab.key}
            // The default section is the bare path, so /series/2AW and
            // /series/2AW?tab=matches are not two URLs for one page.
            href={tab.key === tabs[0].key ? base : `${base}?tab=${tab.key}`}
            className={`${styles.tab} ${current ? styles.active : ''}`}
            aria-current={current ? 'page' : undefined}
            scroll={false}
          >
            {tab.label}
            {tab.count ? <span className={styles.count}>{tab.count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
