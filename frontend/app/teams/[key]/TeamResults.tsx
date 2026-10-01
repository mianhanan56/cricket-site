'use client';

import { useState, type ReactNode } from 'react';
import { SectionHead } from '@/components/ui/Section';
import styles from './team.module.scss';

/** Rendered result rows, the first few shown and the rest a tap away. */
export default function TeamResults({ rows, initial }: { rows: ReactNode[]; initial: number }) {
  const [all, setAll] = useState(false);
  const shown = all ? rows.length : Math.min(initial, rows.length);

  return (
    <section className={styles.section} aria-labelledby="team-results">
      <SectionHead id="team-results" title="Results">
        <span className={styles.shown}>{shown < rows.length ? `${shown} of ${rows.length}` : rows.length}</span>
      </SectionHead>
      <ul className={styles.results}>{rows.slice(0, shown)}</ul>
      {shown < rows.length && (
        <button type="button" className={styles.showAll} onClick={() => setAll(true)}>
          Show all {rows.length} results
        </button>
      )}
    </section>
  );
}
