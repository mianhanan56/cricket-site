import Link from 'next/link';
import type { HeadToHead as H2H } from '@/types';
import styles from './HeadToHead.module.scss';

/**
 * The record between the two sides in this match.
 *
 * Derived, not fetched — crex has no head-to-head endpoint, so this is read off
 * the result sentences on a window of the schedule. See lib/headToHead.
 *
 * The split bar is the same idiom as WinProbability directly above it on this
 * page, deliberately: one is the probability of this match, the other the record
 * behind it, and a reader should recognise the shape.
 *
 * The honesty is in `unresolved`. A meeting whose result names no side we can
 * match is counted separately and printed, rather than being folded into the
 * draws — so "3–2 from 8 meetings" never silently claims to be all eight.
 */
export default function HeadToHead({ record }: { record: H2H }) {
  const { home, away, played, homeWins, awayWins, drawn, unresolved, matches } = record;

  // The bar is drawn over decided matches only: including draws would show a
  // gap that reads as a third team.
  const decided = homeWins + awayWins;
  const homePct = decided ? Math.round((homeWins / decided) * 100) : 50;

  return (
    <div className={styles.h2h}>
      <div className={styles.record}>
        <TeamScore team={home} wins={homeWins} />
        <span className={styles.played}>
          <span className={styles.playedNum}>{played}</span>
          <span className={styles.playedLabel}>
            {played === 1 ? 'meeting' : 'meetings'}
          </span>
        </span>
        <TeamScore team={away} wins={awayWins} align="right" />
      </div>

      {decided > 0 && (
        <div
          className={styles.bar}
          role="img"
          aria-label={`${home.shortName} ${homeWins}, ${away.shortName} ${awayWins}`}
        >
          {/* A percentage cannot be a class, so it is passed as data — the same
              shape WinProbability uses. Every colour lives in the stylesheet. */}
          <span className={styles.barHome} style={{ width: `${homePct}%` }} />
          <span className={styles.barAway} style={{ width: `${100 - homePct}%` }} />
        </div>
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
                {mark === 'N' ? '·' : mark === 'H' ? home.shortName : away.shortName}
              </span>
              <span className={styles.meetingMain}>
                <span className={styles.meetingResult}>{m.result}</span>
                <span className={styles.meetingMeta}>
                  {new Date(m.startTime).toLocaleDateString(undefined, {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                  {m.venue !== 'TBD' && ` · ${m.venue}`}
                </span>
              </span>
              <span className={styles.meetingFormat}>{m.format}</span>
            </>
          );

          return (
            <li key={m.key}>
              {m.id ? (
                <Link href={`/matches/${m.id}`} className={styles.meeting}>
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
