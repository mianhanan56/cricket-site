'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import Icon from '../ui/Icon';
import styles from './SeriesPicker.module.scss';

export interface SeriesOption {
  id: string;
  name: string;
  /** "ENG · Nov 2025 – Jan 2026 · Test" */
  meta: string;
}

const SEARCH_FROM = 7;

/** A listbox of series with a filter box once the list is long enough to need one. */
export default function SeriesPicker({
  options,
  value,
  onChange,
  hasMore,
  loadingMore,
  onLoadMore,
}: {
  options: SeriesOption[];
  value: string | null;
  onChange: (id: string) => void;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = options.find((o) => o.id === value) ?? null;
  const searchable = options.length >= SEARCH_FROM || hasMore;

  const results = useMemo(() => {
    const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return options;
    return options.filter((o) => terms.every((t) => `${o.name} ${o.meta}`.toLowerCase().includes(t)));
  }, [options, q]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    (searchable ? inputRef.current : listRef.current)?.focus();
  }, [open, searchable]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const openMenu = () => {
    setQ('');
    setActive(
      Math.max(
        0,
        options.findIndex((o) => o.id === value)
      )
    );
    setOpen(true);
  };

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  const commit = (option: SeriesOption | undefined) => {
    if (option) onChange(option.id);
    close(true);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => Math.min(Math.max(i + step, 0), results.length - 1));
    } else if (e.key === 'Enter' && e.target !== triggerRef.current) {
      if ((e.target as HTMLElement).dataset.loadMore) return;
      e.preventDefault();
      commit(results[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
    }
  };

  const activeId = results[active] ? `${id}-${results[active].id}` : undefined;

  return (
    <div className={styles.root} ref={rootRef} onKeyDown={onKeyDown}>
      <button
        type="button"
        ref={triggerRef}
        className={`${styles.trigger} ${open ? styles.triggerOpen : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        onClick={() => (open ? close(false) : openMenu())}
      >
        <span className={styles.triggerText}>
          <span className={styles.triggerLabel}>Series</span>
          <span className={styles.triggerValue}>{selected?.name ?? 'Choose a series'}</span>
        </span>
        <Icon name="chevronDown" size={16} className={`${styles.caret} ${open ? styles.caretOpen : ''}`} />
      </button>

      {open && (
        <div className={styles.menu}>
          {searchable && (
            <div className={styles.search}>
              <Icon name="search" size={16} className={styles.searchIcon} />
              <input
                ref={inputRef}
                className={styles.searchInput}
                placeholder="Find a series"
                aria-label="Find a series"
                value={q}
                autoComplete="off"
                role="combobox"
                aria-expanded="true"
                aria-controls={`${id}-list`}
                aria-activedescendant={activeId}
                onChange={(e) => {
                  setQ(e.target.value);
                  setActive(0);
                }}
              />
            </div>
          )}
          <ul
            ref={listRef}
            id={`${id}-list`}
            className={styles.list}
            role="listbox"
            aria-label="Series"
            tabIndex={-1}
            aria-activedescendant={searchable ? undefined : activeId}
          >
            {results.map((o, i) => (
              <li
                key={o.id}
                id={`${id}-${o.id}`}
                role="option"
                aria-selected={o.id === value}
                data-index={i}
                className={`${styles.option} ${i === active ? styles.optionActive : ''}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commit(o)}
              >
                <span className={styles.optionName}>{o.name}</span>
                <span className={styles.optionMeta}>{o.meta}</span>
                {o.id === value && <Icon name="check" size={16} className={styles.optionCheck} />}
              </li>
            ))}
            {!results.length && <li className={styles.none}>No series matches “{q}”</li>}
          </ul>
          {hasMore && (
            <button
              type="button"
              className={styles.more}
              onClick={onLoadMore}
              disabled={loadingMore}
              data-load-more="true"
            >
              {loadingMore ? 'Loading older series' : 'Load older series'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
