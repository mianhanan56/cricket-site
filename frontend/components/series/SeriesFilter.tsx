'use client';

import { useMemo } from 'react';
import type { Match } from '@/types';
import { useQueryTabs } from '@/hooks/useQueryTabs';
import { seriesFromMatches } from '@/lib/crex';
import {
  MATCH_TYPE_OPTIONS,
  filterByMatchType,
  matchTypeKey,
  parseMatchType,
  type MatchTypeKey,
} from '@/lib/matchType';
import { SERIES_STATUS_TABS, type SeriesStatusKey } from '@/lib/tabs';
import FilterSelect from '../ui/FilterSelect';
import SeriesCard from './SeriesCard';
import styles from './SeriesFilter.module.scss';

export interface SeriesFilterProps {
  /** The whole match feed; series are grouped out of it here. */
  matches: Match[];
  /** Initial tab + type, read off the URL by the page. */
  initialStatus: SeriesStatusKey;
  initialType: MatchTypeKey;
}

export default function SeriesFilter({
  matches,
  initialStatus,
  initialType,
}: SeriesFilterProps) {
  // Both filters are URL state: /series?status=live&type=international.
  const [{ status, type }, setQuery] = useQueryTabs(
    { status: initialStatus, type: initialType },
    { status: 'all', type: 'all' }
  );

  const active = SERIES_STATUS_TABS.find((t) => t.key === status) ?? SERIES_STATUS_TABS[0];
  const matchType = parseMatchType(type);

  // Type filter first, then the rollup: a series' status and match count both
  // have to describe the matches actually being shown.
  const grouped = useMemo(
    () => seriesFromMatches(filterByMatchType(matches, matchType)),
    [matches, matchType]
  );

  const visible = useMemo(
    () => (active.status ? grouped.filter((s) => s.status === active.status) : grouped),
    [grouped, active.status]
  );

  // Counts sit on the tabs themselves rather than in a separate stat strip —
  // the number is only useful next to the thing it filters.
  const counts = useMemo(
    () =>
      SERIES_STATUS_TABS.reduce<Record<SeriesStatusKey, number>>(
        (acc, t) => {
          acc[t.key] = t.status
            ? grouped.filter((s) => s.status === t.status).length
            : grouped.length;
          return acc;
        },
        { all: 0, live: 0, upcoming: 0, finished: 0 }
      ),
    [grouped]
  );

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.tabs} role="tablist" aria-label="Series status">
          {SERIES_STATUS_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={status === t.key}
              className={`${styles.tab} ${status === t.key ? styles.active : ''}`}
              onClick={() => setQuery({ status: t.key })}
            >
              {t.label}
              <span className={styles.count}>{counts[t.key]}</span>
            </button>
          ))}
        </div>

        <FilterSelect
          label="Type"
          value={matchType}
          options={MATCH_TYPE_OPTIONS}
          onChange={(next) => setQuery({ type: matchTypeKey(next) })}
        />
      </div>

      {visible.length ? (
        <div className={styles.grid}>
          {visible.map((s) => (
            <SeriesCard key={s.id || s.name} series={s} />
          ))}
        </div>
      ) : (
        <p className={styles.empty}>
          No {type === 'all' ? '' : `${type} `}
          {active.status ? `${active.label.toLowerCase()} ` : ''}series to show right now.
        </p>
      )}
    </>
  );
}
