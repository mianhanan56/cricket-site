'use client';

import { useRef } from 'react';
import styles from './Ticker.module.scss';

/** A value that rolls in when it changes; the value it mounted with stays still. */
export default function Ticker({ value, className }: { value: string | number; className?: string }) {
  const first = useRef(value);
  const moved = useRef(false);
  if (value !== first.current) moved.current = true;

  return (
    <span className={`${styles.ticker} ${className ?? ''}`}>
      <span key={value} className={moved.current ? styles.roll : undefined}>
        {value}
      </span>
    </span>
  );
}
