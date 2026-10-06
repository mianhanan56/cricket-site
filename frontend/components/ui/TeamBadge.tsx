'use client';

import { useEffect, useRef, useState } from 'react';
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
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const classes = `${styles.badge} ${styles[size] ?? ''} ${className ?? ''}`;
  const initials = shortName.replace(/[^A-Za-z0-9]/g, '').slice(0, 3);

  // A crest can finish (or fail) before hydration attaches its handlers.
  useEffect(() => {
    const img = imgRef.current;
    const done = Boolean(img?.complete && img.currentSrc);
    setLoaded(done && (img?.naturalWidth ?? 0) > 0);
    setFailed(done && img?.naturalWidth === 0);
  }, [logo]);

  if (logo && !failed) {
    // Initials hold the square until the crest arrives, so a slow image is never a blank tile.
    return (
      <span
        className={`${classes} ${loaded ? styles.crest : styles.initials}`}
        data-hue={loaded ? undefined : hueBucket(shortName)}
        title={loaded ? undefined : name}
      >
        {!loaded && <span aria-hidden="true">{initials}</span>}
        {/* eslint-disable-next-line @next/next/no-img-element -- tiny pre-optimised crests */}
        <img
          ref={imgRef}
          src={logo}
          alt=""
          width={48}
          height={48}
          loading="lazy"
          decoding="async"
          className={loaded ? undefined : styles.pending}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      </span>
    );
  }

  return (
    <span className={`${classes} ${styles.initials}`} data-hue={hueBucket(shortName)} title={name}>
      {initials}
    </span>
  );
}
