'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { Match } from '@crex/shared';
import MatchCard from './MatchCard';
import styles from './MatchSlider.module.scss';

// Horizontal, scroll-snapping match slider. Arrows drive desktop navigation;
// native touch scrolling handles swipe on mobile. When `autoScroll` is set
// (live matches) it advances one viewport every 5s and loops at the end.
export default function MatchSlider({
  matches,
  autoScroll = false,
}: {
  matches: Match[];
  autoScroll?: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);

  const scroll = useCallback((dir: number) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: el.clientWidth * 0.8 * dir, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (!autoScroll || matches.length < 2) return;
    const el = trackRef.current;
    if (!el) return;

    const id = setInterval(() => {
      const maxScroll = el.scrollWidth - el.clientWidth;
      if (el.scrollLeft >= maxScroll - 8) {
        el.scrollTo({ left: 0, behavior: 'smooth' });
      } else {
        el.scrollBy({ left: el.clientWidth * 0.8, behavior: 'smooth' });
      }
    }, 5000);

    return () => clearInterval(id);
  }, [autoScroll, matches.length]);

  if (!matches.length) return null;

  return (
    <div className={styles.slider}>
      <button
        type="button"
        className={`${styles.arrow} ${styles.left}`}
        onClick={() => scroll(-1)}
        aria-label="Scroll left"
      >
        ‹
      </button>

      <div className={styles.track} ref={trackRef}>
        {matches.map((m) => (
          <div className={styles.slide} key={m.id}>
            <MatchCard match={m} />
          </div>
        ))}
      </div>

      <button
        type="button"
        className={`${styles.arrow} ${styles.right}`}
        onClick={() => scroll(1)}
        aria-label="Scroll right"
      >
        ›
      </button>
    </div>
  );
}
