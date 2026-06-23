'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Match, MatchFormat } from '@crex/shared';
import styles from './FixturesFilter.module.scss';

const TABS: Array<{ key: 'ALL' | MatchFormat; label: string }> = [
  { key: 'ALL', label: 'All' },
  { key: 'T20', label: 'T20' },
  { key: 'ODI', label: 'ODI' },
  { key: 'TEST', label: 'TEST' },
];

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

export default function FixturesFilter({ fixtures }: { fixtures: Match[] }) {
  const [tab, setTab] = useState<'ALL' | MatchFormat>('ALL');

  const visible = tab === 'ALL' ? fixtures : fixtures.filter((f) => f.format === tab);

  return (
    <>
      <div className={styles.tabs} role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={`${styles.tab} ${tab === t.key ? styles.active : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
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
        <p className={styles.empty}>No {tab === 'ALL' ? '' : tab + ' '}fixtures scheduled.</p>
      )}
    </>
  );
}
