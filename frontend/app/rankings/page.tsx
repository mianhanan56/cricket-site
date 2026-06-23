import type { RankingEntry } from '@crex/shared';
import { getRankings } from '../../lib/api';
import styles from './rankings.module.scss';

export const metadata = {
  title: 'ICC Rankings',
  description: 'Latest ICC player rankings for batting and bowling.',
};

function RankingTable({ title, rows }: { title: string; rows: RankingEntry[] }) {
  return (
    <section className={styles.block}>
      <h2 className={styles.blockTitle}>{title}</h2>
      {rows.length ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>#</th>
                <th className={styles.left}>Player</th>
                <th className={styles.left}>Country</th>
                <th>Rating</th>
                <th>Points</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className={styles.pos}>{r.position}</td>
                  <td className={styles.left}>{r.playerName}</td>
                  <td className={styles.left}>{r.country}</td>
                  <td className={styles.num}>{r.rating}</td>
                  <td className={styles.num}>{r.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={styles.empty}>No rankings available.</p>
      )}
    </section>
  );
}

export default async function RankingsPage() {
  let batting: RankingEntry[] = [];
  let bowling: RankingEntry[] = [];
  try {
    [batting, bowling] = await Promise.all([
      getRankings('batting', 'men'),
      getRankings('bowling', 'men'),
    ]);
  } catch {
    /* show empty states */
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>ICC Rankings <span className={styles.sub}>Men</span></h1>
      <RankingTable title="Batting" rows={batting} />
      <RankingTable title="Bowling" rows={bowling} />
    </div>
  );
}
