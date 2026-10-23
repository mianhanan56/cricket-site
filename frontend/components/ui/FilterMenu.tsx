'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Icon from './Icon';
import styles from './FilterMenu.module.scss';

export interface FilterMenuOption<T extends string> {
  value: T;
  label: string;
  /** How many items the option leaves, shown in the open menu. */
  count?: number;
}

/**
 * A choice as a button naming it and its current value ("Format · ODI"). For a filter the first
 * option is the unfiltered one, and any other lights the button.
 */
export default function FilterMenu<T extends string>({
  label,
  value,
  options,
  onChange,
  align = 'start',
  highlight = true,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<FilterMenuOption<T>>;
  onChange: (value: T) => void;
  /** Which edge of the button the menu lines up with. */
  align?: 'start' | 'end';
  /** Off where no option is "everything" — every pick is just a pick. */
  highlight?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const selected = options[index];

  useEffect(() => {
    if (!open) return;
    listRef.current?.focus();
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const show = () => {
    setActive(index);
    setOpen(true);
  };
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };
  const commit = (i: number) => {
    const option = options[i];
    if (option && option.value !== value) onChange(option.value);
    close(true);
  };

  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (i + step + options.length) % options.length);
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      setActive(e.key === 'Home' ? 0 : options.length - 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      commit(active);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
    } else if (e.key === 'Tab') {
      close(false);
    }
  };

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        className={`${styles.trigger} ${highlight && index > 0 ? styles.on : ''} ${open ? styles.open : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-label={`${label}: ${selected?.label ?? ''}`}
        onClick={() => (open ? close(false) : show())}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            show();
          }
        }}
      >
        <span className={styles.label}>{label}</span>
        <span className={styles.value}>{selected?.label}</span>
        <Icon name="chevronDown" size={15} className={styles.caret} />
      </button>

      {open && (
        <ul
          ref={listRef}
          id={`${id}-list`}
          role="listbox"
          aria-label={label}
          tabIndex={-1}
          aria-activedescendant={`${id}-${active}`}
          className={`${styles.menu} ${align === 'end' ? styles.end : ''}`}
          onKeyDown={onListKey}
        >
          {options.map((o, i) => (
            <li
              key={o.value}
              id={`${id}-${i}`}
              role="option"
              aria-selected={o.value === value}
              className={`${styles.option} ${i === active ? styles.optionActive : ''}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => commit(i)}
            >
              <span className={styles.optionLabel}>
                {o.label}
                {o.count !== undefined && <span className={styles.count}>{o.count}</span>}
              </span>
              {o.value === value && <Icon name="check" size={16} className={styles.check} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
