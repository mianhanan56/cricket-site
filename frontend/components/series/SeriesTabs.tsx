import Link from 'next/link';
import styles from './SeriesTabs.module.scss';

export interface SeriesTab {
  key: string;
  label: string;
  count?: number | null;
}

/**
 * Section rail driven by `?tab=`. Links, not buttons, so each section is
 * server-rendered and survives a shared URL.
 */
export default function SeriesTabs({
  base,
  tabs,
  active,
}: {
  /** Path without the query — `/series/2AW`. */
  base: string;
  tabs: SeriesTab[];
  active: string;
}) {
  if (tabs.length < 2) return null;

  return (
    <nav className={styles.rail} aria-label="Series sections">
      <div className={styles.group}>
        {tabs.map((tab) => {
          const current = tab.key === active;
          return (
            <Link
              key={tab.key}
              // The default section is the bare path, so there is one URL per section.
              href={tab.key === tabs[0].key ? base : `${base}?tab=${tab.key}`}
              className={`${styles.tab} ${current ? styles.on : ''}`}
              aria-current={current ? 'page' : undefined}
              scroll={false}
            >
              {tab.label}
              {tab.count ? <span className={styles.count}>{tab.count}</span> : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
