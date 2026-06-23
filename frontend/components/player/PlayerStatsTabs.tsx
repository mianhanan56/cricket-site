'use client';

import { useState } from 'react';
import type { PlayerStats } from '@crex/shared';
import styles from './PlayerStatsTabs.module.scss';

type Tab = 'batting' | 'bowling';

export default function PlayerStatsTabs({ stats }: { stats: PlayerStats }) {
  const hasBatting = !!stats.batting;
  const hasBowling = !!stats.bowling;

  const [tab, setTab] = useState<Tab>(hasBatting ? 'batting' : 'bowling');

  if (!hasBatting && !hasBowling) {
    return <p className={styles.empty}>No career stats available.</p>;
  }

  const b = stats.batting;
  const bw = stats.bowling;

  return (
    <div>
      <div className={styles.tabs} role="tablist">
        {hasBatting && (
          <button
            role="tab"
            aria-selected={tab === 'batting'}
            className={`${styles.tab} ${tab === 'batting' ? styles.active : ''}`}
            onClick={() => setTab('batting')}
          >
            Batting
          </button>
        )}
        {hasBowling && (
          <button
            role="tab"
            aria-selected={tab === 'bowling'}
            className={`${styles.tab} ${tab === 'bowling' ? styles.active : ''}`}
            onClick={() => setTab('bowling')}
          >
            Bowling
          </button>
        )}
      </div>

      {tab === 'batting' && b && (
        <div className={styles.statGrid}>
          <Stat label="Matches" value={b.matches} />
          <Stat label="Innings" value={b.innings} />
          <Stat label="Runs" value={b.runs} accent />
          <Stat label="Average" value={b.average.toFixed(2)} accent />
          <Stat label="Strike Rate" value={b.strikeRate.toFixed(1)} />
          <Stat label="High Score" value={b.highScore ?? '—'} />
          <Stat label="100s" value={b.hundreds} accent />
          <Stat label="50s" value={b.fifties} />
          <Stat label="4s" value={b.fours} />
          <Stat label="6s" value={b.sixes} />
        </div>
      )}

      {tab === 'bowling' && bw && (
        <div className={styles.statGrid}>
          <Stat label="Matches" value={bw.matches} />
          <Stat label="Innings" value={bw.innings} />
          <Stat label="Wickets" value={bw.wickets} accent />
          <Stat label="Average" value={bw.average.toFixed(2)} accent />
          <Stat label="Economy" value={bw.economy.toFixed(2)} />
          <Stat label="Strike Rate" value={bw.strikeRate.toFixed(1)} />
          <Stat label="5W Hauls" value={bw.fiveWickets} accent />
          <Stat label="Best" value={bw.bestBowling ?? '—'} />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className={styles.statCard}>
      <span className={`${styles.statValue} ${accent ? styles.accent : ''}`}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}
