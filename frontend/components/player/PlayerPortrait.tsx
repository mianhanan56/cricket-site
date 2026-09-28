'use client';

import { useState } from 'react';
import styles from './PlayerPortrait.module.scss';

/** First letter of the first and last name — "Abdullah Shafique" → "AS". */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

/** crex's illustrated portrait; a debutant's key 404s, so it falls back to initials. */
export default function PlayerPortrait({
  name,
  src,
  size = 'lg',
}: {
  name: string;
  src?: string | null;
  /** `lg` at the head of a profile, `sm` in a card rail. */
  size?: 'sm' | 'lg';
}) {
  const [failed, setFailed] = useState(false);
  const box = size === 'sm' ? styles.sm : '';

  if (!src || failed) {
    return (
      <span className={`${styles.portrait} ${styles.fallback} ${box}`} aria-hidden="true">
        {initialsOf(name)}
      </span>
    );
  }

  return (
    <span className={`${styles.portrait} ${box}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- small PNGs already on a CDN */}
      <img
        src={src}
        alt={name}
        width={148}
        height={148}
        decoding="async"
        onError={() => setFailed(true)}
      />
    </span>
  );
}
