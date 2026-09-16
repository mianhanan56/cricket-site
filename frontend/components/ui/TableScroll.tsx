import type { ReactNode } from 'react';

export interface TableScrollProps {
  /** The page's own `tableWrap` class — the overflow styling stays with the page. */
  className?: string;
  /**
   * What the region is, for the reader who lands on it by keyboard. Required:
   * a labelled region is the whole point, and `role="region"` without a name is
   * worse than no role at all.
   */
  label: string;
  children: ReactNode;
}

/**
 * A horizontally scrolling table, reachable from the keyboard.
 *
 * This app is mobile-first and its tables are wider than a phone, so they sit in
 * `overflow-x: auto` containers. A plain scrolling div is operable by touch and
 * by mouse wheel and by nothing else: without a tab stop there is no way to
 * reach the scroll with a keyboard, so the columns past the fold are simply
 * unreadable to anyone not using a pointer.
 *
 * `tabIndex={0}` gives it the tab stop, and `role="region"` with a name is what
 * stops that stop being a mystery — it announces what has just been focused
 * instead of dropping the reader on an unnamed group. This is the standard
 * pairing for the pattern; neither half works alone.
 */
export default function TableScroll({ className, label, children }: TableScrollProps) {
  return (
    <div className={className} tabIndex={0} role="region" aria-label={label}>
      {children}
    </div>
  );
}
