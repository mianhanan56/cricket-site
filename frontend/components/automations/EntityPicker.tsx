'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { useCrexMatches } from '@/hooks/useCrexMatches';
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

type Kind = Exclude<ScopeKind, 'ANY' | 'FOLLOWED'>;

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
  const { matches } = useCrexMatches({ intervalMs: 60_000 });
  const follows = useFollows();

  useEffect(() => {
    loadRemoteIndex().then(setRemote);
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
              setActive((i) => Math.min(i + 1, results.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === 'Enter' && results[active]) {
              e.preventDefault();
              choose(results[active]);
            } else if (e.key === 'Escape') setOpen(false);
          }}
        />
        {open && (
          <ul className={styles.pickerList} id={`${id}-list`} role="listbox">
            {results.length ? (
              results.map((e, i) => (
                <li key={e.id} role="option" aria-selected={i === active}>
                  <button
                    type="button"
                    className={`${styles.pickerItem} ${i === active ? styles.pickerActive : ''}`}
                    onMouseDown={(ev) => ev.preventDefault()}
                    onClick={() => choose(e)}
                  >
                    <span>{e.name}</span>
                    <span className={styles.pickerSub}>{e.sub}</span>
                  </button>
                </li>
              ))
            ) : (
              <li className={styles.pickerNone}>No {noun} matches “{q}”</li>
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
