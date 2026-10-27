'use client';

import Link from 'next/link';
import { useFollows } from '@/lib/follows';
import TeamBadge from '../ui/TeamBadge';
import Icon from '../ui/Icon';
import styles from './FollowedList.module.scss';

/** The teams and series a "What I follow" alert covers. */
export default function FollowedList() {
  const { teams, series } = useFollows();

  if (!teams.length && !series.length) {
    return (
      <div className={styles.none}>
        <p>You don’t follow any teams or series yet.</p>
        <Link href="/my#add-teams" className={styles.find}>
          <Icon name="plus" size={15} />
          Follow teams
        </Link>
      </div>
    );
  }

  return (
    <ul className={styles.list} aria-label="Teams and series you follow">
      {teams.map((t) => (
        <li key={t.id} className={styles.item}>
          <TeamBadge name={t.name} shortName={t.shortName} logo={t.logo} size="xs" />
          <span className={styles.name}>{t.name}</span>
        </li>
      ))}
      {series.map((s) => (
        <li key={s.id} className={styles.item}>
          <span className={styles.mark} aria-hidden="true">
            <Icon name="trophy" size={12} />
          </span>
          <span className={styles.name}>{s.name}</span>
        </li>
      ))}
    </ul>
  );
}
