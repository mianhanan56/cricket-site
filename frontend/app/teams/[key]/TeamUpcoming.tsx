'use client';

import { useState } from 'react';
import type { Match } from '@/types';
import UpcomingRail from '@/components/home/UpcomingRail';
import { SectionHead } from '@/components/ui/Section';
import styles from './team.module.scss';

/** The next few fixtures, and the rest already loaded one tap away rather than hidden behind a count. */
export default function TeamUpcoming({ matches, initial }: { matches: Match[]; initial: number }) {
  const [all, setAll] = useState(false);
  const shown = all ? matches.length : Math.min(initial, matches.length);

  return (
    <section className={styles.section} aria-labelledby="team-upcoming">
      <SectionHead id="team-upcoming" title="Upcoming">
        <span className={styles.shown}>{shown < matches.length ? `${shown} of ${matches.length}` : matches.length}</span>
      </SectionHead>
      <UpcomingRail matches={matches} limit={shown} />
      {shown < matches.length && (
        <button type="button" className={styles.showAll} onClick={() => setAll(true)}>
          Show all {matches.length} fixtures
        </button>
      )}
    </section>
  );
}
