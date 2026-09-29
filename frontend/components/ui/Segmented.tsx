'use client';

import { useRef } from 'react';
import { useScrollFade } from '@/hooks/useScrollFade';
import styles from './Segmented.module.scss';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  count?: number;
  /** Marks the live option with a signal. */
  live?: boolean;
}

/**
 * A row of mutually exclusive options. Arrow keys move between them, as a
 * radio group should.
 */
export default function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  size = 'md',
  className,
}: {
  label: string;
  value: T;
  options: readonly SegmentOption<T>[];
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useScrollFade(ref);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const i = options.findIndex((o) => o.value === value);
    const next = options[(i + (e.key === 'ArrowRight' ? 1 : -1) + options.length) % options.length];
    onChange(next.value);
    requestAnimationFrame(() =>
      ref.current?.querySelector<HTMLButtonElement>(`[data-value="${next.value}"]`)?.focus()
    );
  };

  return (
    <div
      ref={ref}
      className={`${styles.group} ${styles[size]} ${className ?? ''}`}
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            data-value={o.value}
            className={`${styles.option} ${on ? styles.on : ''}`}
            onClick={() => onChange(o.value)}
          >
            {o.live && <span className={styles.live} aria-hidden="true" />}
            <span>{o.label}</span>
            {o.count !== undefined && <span className={styles.count}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
