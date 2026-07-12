'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { searchQuery, type SearchResults } from '../../lib/api';
import styles from './SearchBar.module.scss';

interface FlatItem {
  label: string;
  sublabel: string;
  href: string;
  group: string;
}

function flatten(r: SearchResults): FlatItem[] {
  return [
    ...r.players.map((p) => ({
      label: p.name,
      sublabel: p.country,
      href: `/player/${p.id}`,
      group: 'Players',
    })),
    ...r.teams.map((t) => ({
      label: t.name,
      sublabel: t.country,
      href: `/matches`,
      group: 'Teams',
    })),
    ...r.news.map((n) => ({
      label: n.title,
      sublabel: 'News',
      href: `/news/${n.slug}`,
      group: 'News',
    })),
  ];
}

export default function SearchBar() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [items, setItems] = useState<FlatItem[]>([]);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounced search (300ms).
  useEffect(() => {
    if (q.trim().length < 2) {
      setItems([]);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await searchQuery(q.trim());
        setItems(flatten(res));
        setActive(-1);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  // Close on outside click.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const go = (href: string) => {
    setOpen(false);
    setQ('');
    setItems([]);
    router.push(href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (active >= 0 && items[active]) go(items[active].href);
      else if (q.trim()) go(`/search?q=${encodeURIComponent(q.trim())}`);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className={styles.wrap} ref={boxRef}>
      <button
        className={styles.toggle}
        aria-label="Search"
        onClick={() => {
          setOpen((o) => !o);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <span className={styles.toggleLabel}>Search</span>
        <kbd className={styles.kbd}>⌘K</kbd>
      </button>

      <div className={`${styles.panel} ${open ? styles.open : ''}`}>
        <input
          ref={inputRef}
          className={styles.input}
          type="search"
          placeholder="Search players, teams, news…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={items.length > 0}
          aria-controls="search-results"
        />

        {open && q.trim().length >= 2 && (
          <ul className={styles.results} id="search-results" role="listbox">
            {loading && <li className={styles.hint}>Searching…</li>}
            {!loading && items.length === 0 && <li className={styles.hint}>No results.</li>}
            {!loading &&
              items.map((it, i) => (
                <li key={`${it.href}-${i}`} role="option" aria-selected={i === active}>
                  <button
                    className={`${styles.item} ${i === active ? styles.itemActive : ''}`}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(it.href)}
                  >
                    <span className={styles.itemLabel}>{it.label}</span>
                    <span className={styles.itemGroup}>{it.group}</span>
                  </button>
                </li>
              ))}
          </ul>
        )}
      </div>
    </div>
  );
}
