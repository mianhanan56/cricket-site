'use client';

import type { RankingEntry } from '@/types';
import { useQueryTabs } from '@/hooks/useQueryTabs';
import type { RankingsCategory, RankingsFormat, RankingsGender } from '@/lib/tabs';
import styles from './RankingsView.module.scss';

export type Format = RankingsFormat;
export type Gender = RankingsGender;
export type Category = RankingsCategory;

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


export interface RankingsViewProps {
  data: RankingsData;
  /**
   * ICC publication date per gender. Folded into the caption rather than given
   * its own element — a date is a qualifier on "official", not a fact of its
   * own, and the numbers can lag by weeks so leaving it implicit is dishonest.
   */
  asOf?: Partial<Record<Gender, string>>;
  /** Active controls, read off the URL by the page. */
  initial: { format: Format; gender: Gender; category: Category };
}

export default function RankingsView({ data, asOf, initial }: RankingsViewProps) {
  // All three controls live in the URL, so a specific list is linkable:
  // /rankings?format=test&gender=women&category=bowling.
  const [{ format, gender, category }, setQuery] = useQueryTabs(initial, {
    format: 'odi',
    gender: 'men',
    category: 'batting',
  });

  // The ICC publishes no Women's Test rankings — drop that option for women.
  const formats = gender === 'women' ? FORMATS.filter((f) => f.key !== 'test') : FORMATS;

  const setFormat = (f: Format) => setQuery({ format: f });
  const setCategory = (c: Category) => setQuery({ category: c });
  // Switching to women while on Test would land on an empty list, so the
  // format moves with the gender in the same URL update.
  const changeGender = (g: Gender) =>
    setQuery(g === 'women' && format === 'test' ? { gender: g, format: 'odi' } : { gender: g });

  const activeFormatLabel = FORMATS.find((f) => f.key === format)?.label ?? '';
  const rows = data[format]?.[gender]?.[category] ?? [];
  const leader = rows[0];
  const rest = rows.slice(1);

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div className={styles.headText}>
          <h1 className={styles.heading}>ICC Rankings</h1>
          <p className={styles.caption}>
            Official {activeFormatLabel} player rankings
            {asOf?.[gender] ? ` · as of ${asOf[gender]}` : ''}
          </p>
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
