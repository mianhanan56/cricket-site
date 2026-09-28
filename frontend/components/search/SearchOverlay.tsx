'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useCrexMatches } from '@/hooks/useCrexMatches';
import { closeOverlay, openOverlay, useOverlay } from '@/lib/uiState';
import {
  buildIndex,
  loadRemoteIndex,
  querySearch,
  recentSearchStore,
  rememberSearch,
  type EntityType,
  type RemoteIndex,
  type SearchEntity,
} from '@/lib/searchIndex';
import { useFollows } from '@/lib/follows';
import Icon, { type IconName } from '../ui/Icon';
import TeamBadge from '../ui/TeamBadge';
import SyncIndicator from '../ui/SyncIndicator';
import styles from './SearchOverlay.module.scss';

const GROUPS: Array<{ type: EntityType; title: string; icon: IconName }> = [
  { type: 'match', title: 'Matches', icon: 'live' },
  { type: 'team', title: 'Teams', icon: 'teams' },
  { type: 'player', title: 'Players', icon: 'player' },
  { type: 'series', title: 'Series', icon: 'trophy' },
  { type: 'venue', title: 'Venues', icon: 'pin' },
];

const ICON_FOR: Record<EntityType | 'query', IconName> = {
  match: 'live',
  team: 'teams',
  player: 'player',
  series: 'trophy',
  venue: 'pin',
  query: 'search',
};

function isTyping(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

export function SearchHotkeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const combo = e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey);
      const slash = e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !isTyping(e.target);
      if (!combo && !slash) return;
      e.preventDefault();
      openOverlay('search');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return null;
}

export default function SearchOverlay() {
  const open = useOverlay() === 'search';
  return open ? <SearchDialog /> : null;
}

function SearchDialog() {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [index, setIndex] = useState<RemoteIndex | null>(null);
  const [indexLoading, setIndexLoading] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<Element | null>(null);
  const opened = useRef(pathname);

  const { matches, isLoading } = useCrexMatches({ intervalMs: 60_000 });
  const recent = recentSearchStore.use();
  const follows = useFollows();

  useEffect(() => {
    returnFocus.current = document.activeElement;
    inputRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    loadRemoteIndex().then((data) => {
      setIndex(data);
      setIndexLoading(false);
    });
    return () => {
      document.body.style.overflow = prevOverflow;
      if (returnFocus.current instanceof HTMLElement) returnFocus.current.focus();
    };
  }, []);

  useEffect(() => {
    if (pathname !== opened.current) closeOverlay();
  }, [pathname]);

  const entities = useMemo(() => buildIndex(matches, index), [matches, index]);
  const results = useMemo(() => querySearch(entities, q), [entities, q]);

  const suggestions = useMemo<SearchEntity[]>(() => {
    const live = entities.filter((e) => e.type === 'match' && e.status === 'LIVE').slice(0, 4);
    const followed = follows.teams
      .map((t) => entities.find((e) => e.type === 'team' && e.id === t.id))
      .filter((e): e is SearchEntity => Boolean(e));
    const topTeams = (index?.teams ?? [])
      .slice(0, 6)
      .map((t) => entities.find((e) => e.type === 'team' && e.id === t.id))
      .filter((e): e is SearchEntity => Boolean(e) && !followed.includes(e as SearchEntity));
    return [...live, ...followed, ...topTeams].slice(0, 10);
  }, [entities, follows.teams, index]);

  const flat = q.trim() ? results : suggestions;

  useEffect(() => setActive(0), [q]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-idx="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const go = (href: string, label: string, type: EntityType | 'query') => {
    rememberSearch({ href, label, type });
    closeOverlay();
    router.push(href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeOverlay();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, flat.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = flat[active];
      if (pick) go(pick.href, pick.label, pick.type);
      else if (q.trim()) go(`/search?q=${encodeURIComponent(q.trim())}`, q.trim(), 'query');
    } else if (e.key === 'Tab') {
      // Keep focus inside the dialog.
      e.preventDefault();
      inputRef.current?.focus();
    }
  };

  const renderItem = (e: SearchEntity, i: number) => (
    <li key={`${e.type}-${e.id}`} role="option" aria-selected={i === active} id={`sr-${i}`}>
      <button
        type="button"
        data-idx={i}
        className={`${styles.item} ${i === active ? styles.itemActive : ''}`}
        onMouseMove={() => setActive(i)}
        onClick={() => go(e.href, e.label, e.type)}
        tabIndex={-1}
      >
        <span className={styles.itemIcon}>
          {e.type === 'team' ? (
            <TeamBadge name={e.label} shortName={e.sub} logo={e.logo} size="sm" />
          ) : (
            <Icon name={ICON_FOR[e.type]} size={17} />
          )}
        </span>
        <span className={styles.itemText}>
          <span className={styles.itemLabel}>{e.label}</span>
          <span className={styles.itemSub}>{e.sub}</span>
        </span>
        {e.status === 'LIVE' ? (
          <span className={styles.liveTag}>Live</span>
        ) : e.status ? (
          <span className={styles.itemTag}>{e.status === 'UPCOMING' ? 'Upcoming' : 'Result'}</span>
        ) : (
          <Icon name="arrowRight" size={16} className={styles.itemArrow} />
        )}
      </button>
    </li>
  );

  const trimmed = q.trim();

  return (
    <div className={styles.root}>
      <button type="button" className={styles.scrim} aria-label="Close search" onClick={closeOverlay} tabIndex={-1} />
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-label="Search PulseCrease">
        <div className={styles.field}>
          <Icon name="search" size={20} className={styles.fieldIcon} />
          <input
            ref={inputRef}
            className={styles.input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Players, teams, matches, series, venues"
            role="combobox"
            aria-expanded="true"
            aria-controls="search-results"
            aria-activedescendant={flat.length ? `sr-${active}` : undefined}
            autoComplete="off"
            spellCheck={false}
          />
          <button type="button" className={styles.esc} onClick={closeOverlay}>
            Esc
          </button>
        </div>

        <div className={styles.body} ref={listRef} id="search-results">
          {trimmed ? (
            results.length ? (
              GROUPS.map((g) => {
                const items = results.filter((r) => r.type === g.type);
                if (!items.length) return null;
                return (
                  <section key={g.type} className={styles.group}>
                    <h2 className={styles.groupTitle}>{g.title}</h2>
                    <ul role="listbox" aria-label={g.title}>
                      {items.map((e) => renderItem(e, flat.indexOf(e)))}
                    </ul>
                  </section>
                );
              })
            ) : isLoading || indexLoading ? (
              <div className={styles.status}>
                <SyncIndicator label="Searching" />
              </div>
            ) : (
              <div className={styles.none}>
                <p className={styles.noneTitle}>Nothing matches “{trimmed}”</p>
                <button
                  type="button"
                  className={styles.noneAction}
                  onClick={() => go(`/search?q=${encodeURIComponent(trimmed)}`, trimmed, 'query')}
                >
                  Search every match for “{trimmed}”
                </button>
              </div>
            )
          ) : (
            <>
              {recent.length > 0 && (
                <section className={styles.group}>
                  <div className={styles.groupHead}>
                    <h2 className={styles.groupTitle}>Recent</h2>
                    <button type="button" className={styles.clear} onClick={() => recentSearchStore.set([])}>
                      Clear
                    </button>
                  </div>
                  <ul className={styles.recent}>
                    {recent.map((r) => (
                      <li key={r.href}>
                        <button type="button" className={styles.recentItem} onClick={() => go(r.href, r.label, r.type)} tabIndex={-1}>
                          <Icon name={r.type === 'query' ? 'history' : ICON_FOR[r.type]} size={15} />
                          {r.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {suggestions.length > 0 ? (
                <section className={styles.group}>
                  <h2 className={styles.groupTitle}>Suggested</h2>
                  <ul role="listbox" aria-label="Suggested">
                    {suggestions.map((e, i) => renderItem(e, i))}
                  </ul>
                </section>
              ) : (
                <div className={styles.status}>
                  <SyncIndicator label="Syncing live data" />
                </div>
              )}
            </>
          )}
        </div>

        <footer className={styles.foot}>
          <span><kbd>↑</kbd><kbd>↓</kbd> move</span>
          <span><kbd>↵</kbd> open</span>
          <span><kbd>/</kbd> search anywhere</span>
        </footer>
      </div>
    </div>
  );
}
