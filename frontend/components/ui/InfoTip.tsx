'use client';

import { useId, useState, type KeyboardEvent } from 'react';
import Icon from './Icon';
import styles from './InfoTip.module.scss';

export interface InfoTipProps {
  /** The tip itself; also the button's description for screen readers. */
  text: string;
  /** Accessible name of the trigger. */
  label?: string;
}

/** An info button whose note opens on hover, focus or tap — `title` never shows on touch. */
export default function InfoTip({ text, label = 'More info' }: InfoTipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Escape') setOpen(false);
  };

  return (
    <span className={styles.wrap} data-open={open || undefined}>
      <button
        type="button"
        className={styles.trigger}
        aria-label={label}
        aria-describedby={id}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      >
        <Icon name="info" size={15} />
      </button>
      <span id={id} role="tooltip" className={styles.tip}>
        {text}
      </span>
    </span>
  );
}
