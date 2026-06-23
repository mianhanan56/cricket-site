import Link from 'next/link';
import type { Match, InningsScore } from '@crex/shared';
import styles from './MatchCard.module.scss';

function scoreLine(innings: InningsScore | undefined) {
  if (!innings) return '—';
  return `${innings.runs}/${innings.wickets} (${innings.overs})`;
}

export default function MatchCard({ match }: { match: Match }) {
  const isLive = match.status === 'LIVE';
  const homeInn = match.scorecard?.innings?.find((i) => i.teamId === match.homeTeam.id);
  const awayInn = match.scorecard?.innings?.find((i) => i.teamId === match.awayTeam.id);

  return (
    <Link href={`/matches/${match.id}`} className={styles.card}>
      <div className={styles.header}>
        <span className={styles.format}>{match.format}</span>
        {isLive ? (
          <span className={styles.live}>LIVE</span>
        ) : (
          <span className={styles.status}>{match.status}</span>
        )}
      </div>

      <div className={styles.series}>{match.series.name}</div>

      <div className={styles.teams}>
        <div className={styles.team}>
          <span className={styles.teamName}>{match.homeTeam.shortName}</span>
          <span className={styles.score}>{scoreLine(homeInn)}</span>
        </div>
        <div className={styles.team}>
          <span className={styles.teamName}>{match.awayTeam.shortName}</span>
          <span className={styles.score}>{scoreLine(awayInn)}</span>
        </div>
      </div>

      <div className={styles.footer}>
        {match.result ?? match.venue}
      </div>
    </Link>
  );
}
