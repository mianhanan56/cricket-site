import Link from 'next/link';
import type { Match, Team, InningsScore } from '@crex/shared';
import styles from './MatchCard.module.scss';

// CricAPI scores are mapped to innings keyed by team *name* (e.g. "India"),
// not by our internal teamId — so match by name with a positional fallback.
function inningsFor(match: Match, team: Team, index: number): InningsScore | undefined {
  const innings = match.scorecard?.innings ?? [];
  if (!innings.length) return undefined;
  const name = team.name.toLowerCase();
  const short = team.shortName.toLowerCase();
  const byName = innings.find((i) => {
    const t = (i.teamShortName ?? '').toLowerCase();
    return t === name || t === short || (!!t && (t.includes(name) || name.includes(t)));
  });
  return byName ?? innings[index];
}

function scoreLine(innings: InningsScore | undefined) {
  if (!innings) return 'Yet to bat';
  return `${innings.runs}/${innings.wickets} (${innings.overs} ov)`;
}

function formatStart(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const STATUS_CLASS: Record<Match['status'], string> = {
  LIVE: 'isLive',
  UPCOMING: 'isUpcoming',
  COMPLETED: 'isCompleted',
};

export default function MatchCard({ match }: { match: Match }) {
  const isLive = match.status === 'LIVE';
  const isUpcoming = match.status === 'UPCOMING';
  const homeInn = inningsFor(match, match.homeTeam, 0);
  const awayInn = inningsFor(match, match.awayTeam, 1);

  return (
    <Link
      href={`/matches/${match.id}`}
      className={`${styles.card} ${styles[STATUS_CLASS[match.status]]}`}
    >
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
        {isUpcoming ? (
          <span className={styles.clock}>🕐 {formatStart(match.startTime)}</span>
        ) : (
          match.result ?? match.venue
        )}
      </div>
    </Link>
  );
}
