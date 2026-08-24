'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { canGoBackInApp, subscribeNavigation } from '@/lib/navigationDepth';
import styles from './BackButton.module.scss';

export interface BackButtonProps {
  /**
   * Where to go when there is no history to pop — a shared link opened in a
   * fresh tab, or a page landed on from search. Without it, back() on an empty
   * stack leaves the reader stranded on the page they are already looking at.
   */
  fallback?: string;
  /** Accessible name. Never rendered — the control is the arrow alone. */
  label?: string;
}

/**
 * One step back in the browser's own history — the gesture the reader already
 * has on their phone, given a target on the page.
 *
 * It is a button rather than a link because the destination is not knowable at
 * render time: the same match page is reached from the home rail, a series
 * schedule, a team page and search, and each of those is the right way back
 * from it. A hardcoded `<Link href="/">` sends three of those four readers
 * somewhere they were not.
 *
 * Icon only. A back arrow at the top-left of a detail page is the most learned
 * control on the web; spelling it out put a word of chrome above the score.
 */
export default function BackButton({ fallback = '/', label = 'Go back' }: BackButtonProps) {
  const router = useRouter();
  // Resolved after mount: neither the referrer nor the history stack is readable
  // while rendering on the server, and guessing wrong strands the reader.
  const [canPop, setCanPop] = useState(true);

  // `history.length > 1` was the wrong question. It counts every entry in the
  // tab, including ones from before the reader ever reached this site — so a
  // shared match link opened in a tab that had been used for anything else read
  // as poppable and sent them back out to whatever they were on. See
  // lib/navigationDepth for what replaced it.
  useEffect(() => {
    setCanPop(canGoBackInApp());
    // A navigation can happen while this page is mounted (a link inside the
    // match page, then Back), so keep watching rather than reading once.
    return subscribeNavigation(() => setCanPop(canGoBackInApp()));
  }, []);

  const onClick = useCallback(() => {
    if (canPop) router.back();
    else router.push(fallback);
  }, [canPop, fallback, router]);

  return (
    <button type="button" className={styles.back} onClick={onClick} aria-label={label} title={label}>
      <svg
        className={styles.arrow}
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M15 5l-7 7 7 7" />
      </svg>
    </button>
  );
}
