'use client';

import { useState } from 'react';
import type { Match } from '@/types';
import MatchTile from '../match/MatchTile';
import Icon from '../ui/Icon';
import styles from './MatchGrid.module.scss';

/** Match cards in a grid; a long list opens at `limit` with a button for the rest. */
export default function MatchGrid({ matches, label, limit }: { matches: Match[]; label: string; limit?: number }) {
  const [open, setOpen] = useState(false);
  const shown = limit && !open ? matches.slice(0, limit) : matches;
  const hidden = matches.length - shown.length;

  return (
    <div className={styles.frame}>
      <ul className={styles.grid} aria-label={label}>
        {shown.map((m) => (
          <li key={m.id}>
            <MatchTile match={m} />
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <button type="button" className={styles.more} onClick={() => setOpen(true)}>
          Show all {matches.length} matches
          <Icon name="chevronDown" size={17} />
        </button>
      )}
    </div>
  );
}
