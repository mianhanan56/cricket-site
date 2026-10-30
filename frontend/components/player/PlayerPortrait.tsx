'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './PlayerPortrait.module.scss';

/** First letter of the first and last name — "Abdullah Shafique" → "AS". */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

/** The upstream's illustrated portrait; a debutant's key 404s, so it falls back to initials. */
export default function PlayerPortrait({
  name,
  src,
  size = 'lg',
}: {
  name: string;
  src?: string | null;
  /** `lg` at the head of a profile, `sm` in a card rail, `xs` in a search row. */
  size?: 'xs' | 'sm' | 'lg';
}) {
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const box = size === 'lg' ? '' : styles[size];

  // A server-rendered image can fail before hydration attaches onError; it would sit as an empty well.
  useEffect(() => {
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth === 0) setFailed(true);
  }, [src]);

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
        ref={imgRef}
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
