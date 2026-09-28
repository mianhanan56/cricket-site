'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import styles from './FilterSelect.module.scss';

export interface FilterOption<T extends string> {
  value: T;
  label: string;
}

export interface FilterSelectProps<T extends string> {
  /** Accessible name, e.g. "Type". Not rendered — the selected value already says it. */
  label: string;
  value: T;
  options: readonly FilterOption<T>[];
  onChange: (value: T) => void;
  align?: 'left' | 'right';
}

function CaretIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/** Listbox dropdown for a small, fixed set of filter values, with the full listbox keyboard contract. */
export default function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  align = 'right',
}: FilterSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(() => Math.max(0, options.findIndex((o) => o.value === value)));
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId = useId();

  const selected = options.find((o) => o.value === value) ?? options[0];

  const close = useCallback((refocus = false) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }, []);

  // Pointer-down so the menu closes before a click lands underneath it.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const openMenu = () => {
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };

  const commit = (index: number) => {
    const option = options[index];
    if (option) onChange(option.value);
    close(true);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        e.preventDefault();
        if (!open) return openMenu();
        const step = e.key === 'ArrowDown' ? 1 : -1;
        setActive((i) => (i + step + options.length) % options.length);
        return;
      }
      case 'Home':
        if (open) { e.preventDefault(); setActive(0); }
        return;
      case 'End':
        if (open) { e.preventDefault(); setActive(options.length - 1); }
        return;
      case 'Enter':
      case ' ':
        e.preventDefault();
        open ? commit(active) : openMenu();
        return;
      case 'Escape':
        if (open) { e.preventDefault(); close(true); }
        return;
      case 'Tab':
        if (open) setOpen(false);
        return;
    }
  };

  return (
    <div className={styles.root} ref={rootRef} onKeyDown={onKeyDown}>
      <button
        type="button"
        ref={triggerRef}
        className={`${styles.trigger} ${open ? styles.triggerOpen : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`${label}: ${selected?.label ?? ''}`}
        onClick={() => (open ? close() : openMenu())}
      >
        <span className={styles.triggerValue}>{selected?.label}</span>
        <span className={`${styles.caret} ${open ? styles.caretOpen : ''}`}>
          <CaretIcon />
        </span>
      </button>

      {open && (
        <ul
          className={`${styles.menu} ${align === 'left' ? styles.menuLeft : styles.menuRight}`}
          id={listId}
          role="listbox"
          aria-label={label}
          tabIndex={-1}
        >
          {options.map((option, i) => (
            <li key={option.value} role="none">
              <button
                type="button"
                role="option"
                aria-selected={option.value === value}
                className={`${styles.option} ${i === active ? styles.optionActive : ''} ${
                  option.value === value ? styles.optionSelected : ''
                }`}
                onMouseEnter={() => setActive(i)}
                onClick={() => commit(i)}
              >
                <span className={styles.dot} aria-hidden="true" />
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
