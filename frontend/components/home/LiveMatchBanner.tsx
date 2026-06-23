import Link from 'next/link';
import type { Match, InningsScore } from '@crex/shared';
import styles from './LiveMatchBanner.module.scss';

function line(inn?: InningsScore) {
  return inn ? `${inn.runs}/${inn.wickets}` : 'Yet to bat';
}
function oversLine(inn?: InningsScore) {
  return inn ? `(${inn.overs} ov)` : '';
}

export default function LiveMatchBanner({ match }: { match: Match }) {
  const home = match.scorecard?.innings?.find((i) => i.teamId === match.homeTeam.id);
  const away = match.scorecard?.innings?.find((i) => i.teamId === match.awayTeam.id);

  return (
    <Link href={`/matches/${match.id}`} className={styles.banner}>
      <div className={styles.top}>
        <span className={styles.live}>LIVE</span>
        <span className={styles.meta}>
          {match.format} · {match.series.name}
        </span>
      </div>

      <div className={styles.teams}>
        <div className={styles.team}>
          <span className={styles.name}>{match.homeTeam.name}</span>
          <span className={styles.score}>{line(home)}</span>
          <span className={styles.overs}>{oversLine(home)}</span>
        </div>
        <span className={styles.vs}>vs</span>
        <div className={`${styles.team} ${styles.right}`}>
          <span className={styles.name}>{match.awayTeam.name}</span>
          <span className={styles.score}>{line(away)}</span>
          <span className={styles.overs}>{oversLine(away)}</span>
        </div>
      </div>

      <div className={styles.venue}>{match.venue}</div>
    </Link>
  );
}
