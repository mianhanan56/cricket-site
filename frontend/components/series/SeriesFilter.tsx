'use client';

import { useMemo } from 'react';
import type { Match, MatchStatus, SeriesSummary } from '@/types';
import { useQueryTabs } from '@/hooks/useQueryTabs';
import { seriesFromMatches } from '@/lib/crex';
import {
  MATCH_TYPE_OPTIONS,
  filterByMatchType,
  matchTypeKey,
  parseMatchType,
  type MatchType,
  type MatchTypeKey,
} from '@/lib/matchType';
import { SERIES_STATUS_TABS, type SeriesStatusKey } from '@/lib/tabs';
import Segmented from '../ui/Segmented';
import EmptyState from '../ui/EmptyState';
import { SectionHead } from '../ui/Section';
import SeriesCard from './SeriesCard';
import styles from './SeriesFilter.module.scss';

export interface SeriesFilterProps {
  /** The whole match feed; series are grouped out of it here. */
  matches: Match[];
  /** Real spans and totals from each series' own schedule, keyed by series id. */
  totals?: Record<string, SeriesSummary>;
  initialStatus: SeriesStatusKey;
  initialType: MatchTypeKey;
}

const GROUPS: Array<{ status: MatchStatus; title: string }> = [
  { status: 'LIVE', title: 'Ongoing' },
  { status: 'UPCOMING', title: 'Upcoming' },
  { status: 'COMPLETED', title: 'Finished' },
];

function order(list: SeriesSummary[], status: MatchStatus): SeriesSummary[] {
  if (status === 'UPCOMING') return [...list].sort((a, b) => +new Date(a.startDate) - +new Date(b.startDate));
  if (status === 'COMPLETED') return [...list].sort((a, b) => +new Date(b.endDate) - +new Date(a.endDate));
  return list;
}

export function SeriesList({ series }: { series: SeriesSummary[] }) {
  return (
    <ul className={styles.list}>
      {series.map((s) => (
        <li key={s.id || s.name}>
          <SeriesCard series={s} />
        </li>
      ))}
    </ul>
  );
}

export default function SeriesFilter({ matches, totals, initialStatus, initialType }: SeriesFilterProps) {
  const [{ status, type }, setQuery] = useQueryTabs(
    { status: initialStatus, type: initialType },
    { status: 'all', type: 'all' }
  );

  const active = SERIES_STATUS_TABS.find((t) => t.key === status) ?? SERIES_STATUS_TABS[0];
  const matchType = parseMatchType(type);

  // Type filter before the rollup, so a series' status and count describe the
  // matches actually shown; a fetched schedule then replaces the rollup's figures.
  const grouped = useMemo(() => {
    const rolled = seriesFromMatches(filterByMatchType(matches, matchType));
    return totals ? rolled.map((s) => totals[s.id] ?? s) : rolled;
  }, [matches, matchType, totals]);

  const counts = useMemo(
    () =>
      SERIES_STATUS_TABS.reduce<Record<SeriesStatusKey, number>>(
        (acc, t) => {
          acc[t.key] = t.status ? grouped.filter((s) => s.status === t.status).length : grouped.length;
          return acc;
        },
        { all: 0, live: 0, upcoming: 0, finished: 0 }
      ),
    [grouped]
  );

  const sections = useMemo(
    () =>
      GROUPS.filter((g) => !active.status || g.status === active.status)
        .map((g) => ({ ...g, items: order(grouped.filter((s) => s.status === g.status), g.status) }))
        .filter((g) => g.items.length > 0),
    [grouped, active.status]
  );

  const typeWord = type === 'all' ? '' : `${type} `;

  return (
    <>
      <div className={styles.toolbar}>
        <Segmented
          label="Series status"
          value={status}
          options={SERIES_STATUS_TABS.map((t) => ({
            value: t.key,
            label: t.label,
            count: counts[t.key],
          }))}
          onChange={(next: SeriesStatusKey) => setQuery({ status: next })}
        />
        <Segmented
          label="Series type"
          size="sm"
          value={matchType}
          options={MATCH_TYPE_OPTIONS}
          onChange={(next: MatchType) => setQuery({ type: matchTypeKey(next) })}
          className={styles.type}
        />
      </div>

      {sections.length === 0 ? (
        <EmptyState
          icon="trophy"
          title={`No ${typeWord}${active.status ? `${active.label.toLowerCase()} ` : ''}series right now`}
          action={
            status !== 'all' || type !== 'all'
              ? { label: 'Show all series', onClick: () => setQuery({ status: 'all', type: 'all' }) }
              : undefined
          }
        />
      ) : active.status ? (
        <SeriesList series={sections[0].items} />
      ) : (
        <div className={styles.sections}>
          {sections.map((g) => (
            <section key={g.status} aria-label={`${g.title} series`}>
              <SectionHead title={g.title} count={g.items.length} level={3} />
              <SeriesList series={g.items} />
            </section>
          ))}
        </div>
      )}
    </>
  );
}
