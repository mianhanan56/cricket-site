import type { Match } from '@crex/shared';
import { getMatches } from '../../lib/api';
import MatchCard from '../../components/home/MatchCard';
import styles from './matches.module.scss';

export const metadata = {
  title: 'Matches',
  description: 'Live, upcoming and completed cricket matches.',
};

export default async function MatchesPage() {
  let matches: Match[] = [];
  try {
    matches = await getMatches();
  } catch {
    /* render empty state below */
  }

  const groups: { key: string; title: string }[] = [
    { key: 'LIVE', title: 'Live' },
    { key: 'UPCOMING', title: 'Upcoming' },
    { key: 'COMPLETED', title: 'Recent Results' },
  ];

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Matches</h1>

      {groups.map(({ key, title }) => {
        const items = matches.filter((m) => m.status === key);
        if (!items.length) return null;
        return (
          <section key={key} className={styles.section}>
            <h2 className={styles.sectionTitle}>{title}</h2>
            <div className={styles.grid}>
              {items.map((m) => (
                <MatchCard key={m.id} match={m} />
              ))}
            </div>
          </section>
        );
      })}

      {!matches.length && <p className={styles.empty}>No matches available.</p>}
    </div>
  );
}
