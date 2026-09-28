'use client';

import { useState } from 'react';
import styles from './TeamBadge.module.scss';

const HUES = 12;

// Stable per-team tint bucket for the initials fallback.
function hueBucket(code: string): number {
  let h = 0;
  for (let i = 0; i < code.length; i += 1) h = (h * 31 + code.charCodeAt(i)) % 360;
  return Math.floor(h / (360 / HUES));
}

/**
 * Team crest with an initials fallback. Crests 404 for some domestic sides, so
 * the image drops to initials on error rather than showing a broken icon.
 */
export default function TeamBadge({
  name,
  shortName,
  logo,
  size = 'md',
  className,
}: {
  name: string;
  shortName: string;
  logo?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const classes = `${styles.badge} ${styles[size]} ${className ?? ''}`;

  if (logo && !failed) {
    return (
      <span className={`${classes} ${styles.crest}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- tiny pre-optimised crests */}
        <img
          src={logo}
          alt=""
          width={48}
          height={48}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      </span>
    );
  }

  return (
    <span className={`${classes} ${styles.initials}`} data-hue={hueBucket(shortName)} title={name}>
      {shortName.replace(/[^A-Za-z0-9]/g, '').slice(0, 3)}
    </span>
  );
}
