'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { useApiMatches } from '@/hooks/useApiMatches';
import { loadRemoteIndex, type RemoteIndex } from '@/lib/searchIndex';
import { useFollows } from '@/lib/follows';
import { activeSeries, activeTeams } from '@/lib/alertSuggestions';
import type { ScopeKind } from '@/lib/automations';
import Icon from '../ui/Icon';
import styles from './EntityPicker.module.scss';

export interface PickedEntity {
  id: string;
  name: string;
}

type Kind = Exclude<ScopeKind, 'ANY' | 'FOLLOWED' | 'MATCH'>;

const SUGGESTED = { TEAM: 8, SERIES: 6 };

/** A typeahead over real teams, series and players the app knows about. */
export default function EntityPicker({
  kind,
  value,
  onChange,
}: {
  kind: Kind;
  value: PickedEntity | null;
  onChange: (next: PickedEntity | null) => void;
}) {
  const id = useId();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [remote, setRemote] = useState<RemoteIndex | null>(null);
  const [remoteSettled, setRemoteSettled] = useState(false);
  const { matches } = useApiMatches({ intervalMs: 60_000 });
  const follows = useFollows();

  useEffect(() => {
    loadRemoteIndex().then((data) => {
      setRemote(data);
      setRemoteSettled(true);
    });
  }, []);

  const pool = useMemo<Array<PickedEntity & { sub: string }>>(() => {
    const seen = new Map<string, PickedEntity & { sub: string }>();
    const add = (e: PickedEntity & { sub: string }) => !seen.has(e.id) && e.id && seen.set(e.id, e);
    if (kind === 'TEAM') {
      follows.teams.forEach((t) => add({ id: t.id, name: t.name, sub: 'Following' }));
      matches.forEach((m) => [m.homeTeam, m.awayTeam].forEach((t) => add({ id: t.id, name: t.name, sub: t.shortName })));
      remote?.teams.forEach((t) => add({ id: t.id, name: t.name, sub: t.shortName }));
    } else if (kind === 'SERIES') {
      follows.series.forEach((s) => add({ ...s, sub: 'Following' }));
      matches.forEach((m) => add({ id: m.series.id, name: m.series.name, sub: m.format }));
    } else {
      follows.players.forEach((p) => add({ ...p, sub: 'Following' }));
      remote?.players.forEach((p) => add({ id: p.id, name: p.name, sub: p.country }));
    }
    return [...seen.values()];
  }, [kind, follows, matches, remote]);

  const suggested = useMemo(
    () => (kind === 'TEAM' ? activeTeams(matches, SUGGESTED.TEAM) : kind === 'SERIES' ? activeSeries(matches, SUGGESTED.SERIES) : []),
    [kind, matches]
  );

  const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const results = (terms.length ? pool.filter((e) => terms.every((t) => `${e.name} ${e.sub}`.toLowerCase().includes(t))) : pool).slice(0, 8);

  const noun = kind === 'TEAM' ? 'team' : kind === 'SERIES' ? 'series' : 'player';
  const loading = !remoteSettled && kind !== 'SERIES';
  const current = Math.min(active, results.length - 1);

  if (value) {
    return (
      <div className={styles.picked}>
        <span className={styles.pickedName}>{value.name}</span>
        <button type="button" className={styles.pickedClear} onClick={() => onChange(null)} aria-label={`Change ${noun}`}>
          <Icon name="close" size={15} />
        </button>
      </div>
    );
  }

  const choose = (e: PickedEntity) => {
    onChange({ id: e.id, name: e.name });
    setQ('');
    setOpen(false);
  };

  return (
    <div className={styles.pickerWrap}>
      <div className={styles.picker}>
        <label htmlFor={id} className={styles.srOnly}>
          Choose a {noun}
        </label>
        <Icon name="search" size={16} className={styles.pickerIcon} />
        <input
          id={id}
          className={styles.pickerInput}
          placeholder={`Find a ${noun}`}
          value={q}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={open && current >= 0 ? `${id}-opt-${current}` : undefined}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
              setActive(Math.max(0, Math.min(current + 1, results.length - 1)));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive(Math.max(current - 1, 0));
            } else if (e.key === 'Enter' && open && results[current]) {
              e.preventDefault();
              choose(results[current]);
            } else if (e.key === 'Escape') setOpen(false);
          }}
        />
        {open && (
          <ul className={styles.pickerList} id={`${id}-list`} role="listbox">
            {results.length ? (
              results.map((e, i) => (
                <li
                  key={e.id}
                  id={`${id}-opt-${i}`}
                  role="option"
                  aria-selected={i === current}
                  className={`${styles.pickerItem} ${i === current ? styles.pickerActive : ''}`}
                  onMouseDown={(ev) => ev.preventDefault()}
                  onMouseMove={() => setActive(i)}
                  onClick={() => choose(e)}
                >
                  <span>{e.name}</span>
                  <span className={styles.pickerSub}>{e.sub}</span>
                </li>
              ))
            ) : loading ? (
              <li className={styles.pickerNone} role="presentation">
                Loading {noun === 'series' ? 'series' : `${noun}s`}…
              </li>
            ) : (
              <li className={styles.pickerNone} role="presentation">
                {q.trim() ? `No ${noun} matches “${q.trim()}”` : `No ${noun} to pick yet`}
              </li>
            )}
          </ul>
        )}
      </div>
      {suggested.length > 0 && (
        <div className={styles.suggest}>
          <span id={`${id}-suggest`} className={styles.suggestLabel}>
            {kind === 'TEAM' ? 'Currently active' : 'Current series'}
          </span>
          <ul className={styles.suggestList} aria-labelledby={`${id}-suggest`}>
            {suggested.map((e) => (
              <li key={e.id}>
                <button type="button" className={styles.suggestItem} onClick={() => choose(e)}>
                  {e.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
