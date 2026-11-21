'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { canGoBackInApp } from '@/lib/navigationDepth';
import styles from './BackButton.module.scss';

export interface BackButtonProps {
  /** Where to go when there is no in-app history to pop (a shared link in a fresh tab). */
  fallback?: string;
  /** Accessible name. Never rendered — the control is the arrow alone. */
  label?: string;
  className?: string;
}

/** One step back in the browser's own history; a button because the right destination depends on how the reader arrived. */
export default function BackButton({ fallback = '/', label = 'Go back', className }: BackButtonProps) {
  const router = useRouter();

  const onClick = useCallback(() => {
    if (canGoBackInApp()) router.back();
    else router.push(fallback);
  }, [fallback, router]);

  return (
    <button
      type="button"
      className={`${styles.back} ${className ?? styles.spaced}`}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
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
