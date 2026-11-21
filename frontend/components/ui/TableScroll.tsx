'use client';

import { useRef, type ReactNode } from 'react';
import { useScrollFade } from '@/hooks/useScrollFade';
import styles from './TableScroll.module.scss';

export interface TableScrollProps {
  /** The page's own `tableWrap` class — the overflow styling stays with the page. */
  className?: string;
  /** Required: role="region" without a name is worse than no role. */
  label: string;
  children: ReactNode;
}

// A scrolling div has no tab stop, so keyboard readers couldn't reach columns past the fold.
export default function TableScroll({ className, label, children }: TableScrollProps) {
  const ref = useRef<HTMLDivElement>(null);
  // The edge with more columns behind it fades, so a phone reader knows to swipe.
  useScrollFade(ref);
  return (
    <div ref={ref} className={`${styles.scroll} ${className ?? ''}`} tabIndex={0} role="region" aria-label={label}>
      {children}
    </div>
  );
}
