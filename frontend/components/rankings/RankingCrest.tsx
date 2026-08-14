'use client';

import { useState } from 'react';
import styles from './RankingsView.module.scss';

/**
 * Team crest for a rankings row, degrading to the short name.
 *
 * A client component for the same reason MatchCard's badge is one: crests 404
 * for a handful of associate and women's sides, and a broken-image glyph in a
 * ten-row table is worse than three letters. It does NOT reuse TeamBadge — that
 * one falls back to a hue-derived gradient built with an inline style, which is
 * right for a match card carrying two big sides and wrong for a dense list where
 * ten different gradients would fight the accent for attention.
 */
export default function RankingCrest({
  name,
  shortName,
  logo,
  size = 'sm',
}: {
  name: string;
  shortName: string;
  logo?: string | null;
  /** `lg` in the podium, `sm` in the table. */
  size?: 'sm' | 'lg';
}) {
  const [failed, setFailed] = useState(false);
  const box = size === 'lg' ? 48 : 28;

  return (
    <span className={`${styles.crest} ${size === 'lg' ? styles.crestLg : ''}`}>
      {logo && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- crests are 1-5KB
        // webp already optimized on Akamai; next/image would add a proxy hop.
        <img
          src={logo}
          alt={`${name} crest`}
          width={box}
          height={box}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className={styles.crestFallback}>{shortName.slice(0, 3)}</span>
      )}
    </span>
  );
}
