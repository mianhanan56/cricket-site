'use client';

import { useState } from 'react';
import type { RankingEntry } from '@crex/shared';
import styles from './RankingsView.module.scss';

export type Format = 'test' | 'odi' | 't20i';
export type Gender = 'men' | 'women';
export type Category = 'batting' | 'bowling' | 'all-rounder';

// format × gender × category — every combination the API supports. Women's
// Test isn't published by the ICC, so that slice is simply empty.
export type RankingsData = Record<Format, Record<Gender, Record<Category, RankingEntry[]>>>;

const FORMATS: { key: Format; label: string }[] = [
  { key: 'test', label: 'Test' },
  { key: 'odi', label: 'ODI' },
  { key: 't20i', label: 'T20I' },
];

const GENDERS: { key: Gender; label: string }[] = [
  { key: 'men', label: 'Men' },
  { key: 'women', label: 'Women' },
];

const CATEGORIES: { key: Category; label: string }[] = [
  { key: 'batting', label: 'Batting' },
  { key: 'bowling', label: 'Bowling' },
  { key: 'all-rounder', label: 'All-rounder' },
];

export default function RankingsView({ data }: { data: RankingsData }) {
  const [format, setFormat] = useState<Format>('odi');
  const [gender, setGender] = useState<Gender>('men');
  const [category, setCategory] = useState<Category>('batting');

  // The ICC publishes no Women's Test rankings — drop that option for women.
  const formats = gender === 'women' ? FORMATS.filter((f) => f.key !== 'test') : FORMATS;

  const changeGender = (g: Gender) => {
    setGender(g);
    if (g === 'women' && format === 'test') setFormat('odi');
  };

  const activeFormatLabel = FORMATS.find((f) => f.key === format)?.label ?? '';
  const rows = data[format]?.[gender]?.[category] ?? [];
  const leader = rows[0];
  const rest = rows.slice(1);

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div className={styles.headText}>
          <h1 className={styles.heading}>ICC Rankings</h1>
          <p className={styles.caption}>Official {activeFormatLabel} player rankings</p>
        </div>

        {/* Gender — segmented control */}
        <div className={styles.segment} role="tablist" aria-label="Gender">
          {GENDERS.map((g) => (
            <button
              key={g.key}
              type="button"
              role="tab"
              aria-selected={gender === g.key}
              className={`${styles.segmentBtn} ${gender === g.key ? styles.segmentActive : ''}`}
              onClick={() => changeGender(g.key)}
            >
              {g.label}
            </button>
          ))}
        </div>
      </header>

      <div className={styles.controls}>
        {/* Format — segmented control */}
        <div className={styles.segment} role="tablist" aria-label="Format">
          {formats.map((f) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={format === f.key}
              className={`${styles.segmentBtn} ${format === f.key ? styles.segmentActive : ''}`}
              onClick={() => setFormat(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Category — pill row */}
        <nav className={styles.pills} role="tablist" aria-label="Ranking category">
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              role="tab"
              aria-selected={category === c.key}
              className={`${styles.pill} ${category === c.key ? styles.pillActive : ''}`}
              onClick={() => setCategory(c.key)}
            >
              {c.label}
            </button>
          ))}
        </nav>
      </div>

      {leader ? (
        <>
          {/* Signature element — the #1 spotlight */}
          <div className={styles.leader}>
            <span className={styles.leaderRing} aria-hidden="true">
              1
            </span>
            <div className={styles.leaderMain}>
              <span className={styles.leaderEyebrow}>Rank 1</span>
              <span className={styles.leaderName}>{leader.playerName}</span>
              <span className={styles.leaderCountry}>{leader.country}</span>
            </div>
            <div className={styles.leaderScore}>
              <span className={styles.leaderRating}>{leader.rating}</span>
              <span className={styles.leaderRatingLabel}>Rating</span>
            </div>
          </div>

          {rest.length > 0 && (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th className={styles.left}>Player</th>
                    <th className={styles.left}>Country</th>
                    <th>Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {rest.map((r) => (
                    <tr key={r.id}>
                      <td className={styles.pos}>{r.position}</td>
                      <td className={styles.left}>{r.playerName}</td>
                      <td className={`${styles.left} ${styles.country}`}>{r.country}</td>
                      <td className={styles.num}>{r.rating}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <p className={styles.empty}>No rankings available for this category yet.</p>
      )}
    </div>
  );
}
