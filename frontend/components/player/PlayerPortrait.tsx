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

/**
 * The illustrated portrait crex draws for a player, with initials as the
 * fallback.
 *
 * A client component for the same reason TeamBadge is: the illustrations only
 * exist for players crex has drawn — a debutant's key 404s — and a broken-image
 * glyph in the page's largest element is far worse than a monogram. Every other
 * part of the profile is static, so this is the one island of interactivity.
 */
export default function PlayerPortrait({
  name,
  src,
}: {
  name: string;
  src?: string | null;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <span className={`${styles.portrait} ${styles.fallback}`} aria-hidden="true">
        {initialsOf(name)}
      </span>
    );
  }

  return (
    <span className={styles.portrait}>
      {/* eslint-disable-next-line @next/next/no-img-element -- crex's portraits
          are small PNGs already on Akamai; next/image would add a proxy hop and
          is not used anywhere in this app. */}
      <img
        src={src}
        alt={name}
        width={132}
        height={132}
        decoding="async"
        onError={() => setFailed(true)}
      />
    </span>
  );
}
