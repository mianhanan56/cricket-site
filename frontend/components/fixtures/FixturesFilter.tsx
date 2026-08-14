'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import type { Match } from '@/types';
import { useQueryTabs } from '@/hooks/useQueryTabs';
import {
  MATCH_TYPE_OPTIONS,
  filterByMatchType,
  matchTypeKey,
  parseMatchType,
  type MatchTypeKey,
} from '@/lib/matchType';
import { FIXTURE_FORMAT_TABS, type FixtureFormatKey } from '@/lib/tabs';
import FilterSelect from '../ui/FilterSelect';
import styles from './FixturesFilter.module.scss';


function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export interface FixturesFilterProps {
  fixtures: Match[];
  /** Initial tab + type, read off the URL by the page. */
  initialFormat: FixtureFormatKey;
  initialType: MatchTypeKey;
}

export default function FixturesFilter({
  fixtures,
  initialFormat,
  initialType,
}: FixturesFilterProps) {
  // Both filters are URL state: /fixtures?format=t20&type=international.
  const [{ format, type }, setQuery] = useQueryTabs(
    { format: initialFormat, type: initialType },
    { format: 'all', type: 'all' }
  );

  const active = FIXTURE_FORMAT_TABS.find((t) => t.key === format) ?? FIXTURE_FORMAT_TABS[0];
  const matchType = parseMatchType(type);

  const visible = useMemo(() => {
    const byType = filterByMatchType(fixtures, matchType);
    return active.format ? byType.filter((f) => f.format === active.format) : byType;
  }, [fixtures, matchType, active.format]);

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.tabs} role="tablist" aria-label="Match format">
          {FIXTURE_FORMAT_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={format === t.key}
              className={`${styles.tab} ${format === t.key ? styles.active : ''}`}
              onClick={() => setQuery({ format: t.key })}
            >
              {t.label}
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
          {visible.map((m) => (
            <Link key={m.id} href={`/matches/${m.id}`} className={styles.card}>
              <div className={styles.cardTop}>
                <span className={styles.format}>{m.format}</span>
                <span className={styles.date}>{formatDateTime(m.startTime)}</span>
              </div>
              <div className={styles.teams}>
                <span>{m.homeTeam.shortName}</span>
                <span className={styles.vs}>vs</span>
                <span>{m.awayTeam.shortName}</span>
              </div>
              <div className={styles.series}>{m.series.name}</div>
              <div className={styles.venue}>{m.venue}</div>
            </Link>
          ))}
        </div>
      ) : (
        <p className={styles.empty}>
          No {type === 'all' ? '' : `${type} `}
          {active.format ? `${active.format} ` : ''}fixtures scheduled.
        </p>
      )}
    </>
  );
}
