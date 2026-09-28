'use client';

import { useState } from 'react';
import styles from './RankingCrest.module.scss';

/**
 * Team crest for dense lists, degrading to the short name. Unlike TeamBadge the
 * fallback is neutral: ten hue-tinted initials in one table fight for attention.
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
  size?: 'sm' | 'lg';
}) {
  const [failed, setFailed] = useState(false);
  const box = size === 'lg' ? 48 : 28;

  return (
    <span className={`${styles.crest} ${size === 'lg' ? styles.lg : ''}`}>
      {logo && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- tiny pre-optimised crests
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
        <span className={styles.fallback}>{shortName.slice(0, 3)}</span>
      )}
    </span>
  );
}
