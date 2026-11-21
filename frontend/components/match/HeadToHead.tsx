import Link from 'next/link';
import { ON_INTENT } from '@/lib/intentPrefetch';
import type { HeadToHead as H2H } from '@/types';
import LocalTime from '../ui/LocalTime';
import { meetingFormat } from '@/lib/seriesFormat';
import styles from './HeadToHead.module.scss';
import { venueText } from '@/lib/venue';

function noWinnerMark(result: string): string {
  if (/draw/i.test(result)) return 'Draw';
  if (/\btie|tied/i.test(result)) return 'Tie';
  if (/no result|abandon/i.test(result)) return 'NR';
  return '—';
}

export default function HeadToHead({ record }: { record: H2H }) {
  const { home, away, played, homeWins, awayWins, drawn, unresolved, matches } = record;

  // Decided matches only: draws in the bar would read as a third team.
  const decided = homeWins + awayWins;
  const homePct = decided ? Math.round((homeWins / decided) * 100) : 50;

  return (
    <div className={styles.h2h}>
      <div className={styles.record}>
        <TeamScore team={home} wins={homeWins} />
        <span className={styles.played}>
          <span className={styles.playedNum}>{played}</span>
          <span className={styles.playedLabel}>
            {played === 1 ? 'match' : 'matches'}
          </span>
        </span>
        <TeamScore team={away} wins={awayWins} align="right" />
      </div>

      {decided > 0 && (
        <svg
          className={styles.bar}
          viewBox="0 0 100 6"
          preserveAspectRatio="none"
          role="img"
          aria-label={`${home.shortName} ${homeWins}, ${away.shortName} ${awayWins}`}
        >
          <rect className={styles.barHome} x="0" y="0" width={homePct} height="6" />
          <rect className={styles.barAway} x={homePct} y="0" width={100 - homePct} height="6" />
        </svg>
      )}

      {(drawn > 0 || unresolved > 0) && (
        <p className={styles.aside}>
          {drawn > 0 && `${drawn} drawn, tied or abandoned`}
          {drawn > 0 && unresolved > 0 && ' · '}
          {unresolved > 0 && `${unresolved} not attributable to either side`}
        </p>
      )}

      <ul className={styles.meetings}>
        {matches.map((m) => {
          const mark = m.winnerKey ? (m.winnerKey === home.id ? 'H' : 'A') : 'N';
          const body = (
            <>
              <span className={styles.mark} data-side={mark}>
                {mark === 'N' ? noWinnerMark(m.result) : mark === 'H' ? home.shortName : away.shortName}
              </span>
              <span className={styles.meetingMain}>
                <span className={styles.meetingResult}>{m.result}</span>
                <span className={styles.meetingMeta}>
                  <LocalTime iso={m.startTime} format="date" />
                  {` · ${venueText(m.venue)}`}
                </span>
              </span>
              <span className={styles.meetingFormat}>{meetingFormat(m)}</span>
            </>
          );

          return (
            <li key={m.key}>
              {m.id ? (
                <Link href={`/matches/${m.id}`} {...ON_INTENT} className={styles.meeting}>
                  {body}
                </Link>
              ) : (
                <div className={`${styles.meeting} ${styles.meetingInert}`}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TeamScore({
  team,
  wins,
  align,
}: {
  team: H2H['home'];
  wins: number;
  align?: 'right';
}) {
  return (
    <Link
      href={`/teams/${team.id}`}
      className={styles.side}
      data-align={align}
      data-leading={wins > 0 ? '' : undefined}
    >
      <span className={styles.wins}>{wins}</span>
      <span className={styles.sideName}>{team.shortName}</span>
    </Link>
  );
}
