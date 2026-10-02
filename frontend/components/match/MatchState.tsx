import type { InningsScore } from '@/types';
import styles from './MatchState.module.scss';

const RETIREMENT_LABEL = {
  HURT: 'Retired hurt',
  ABSENT: 'Absent hurt',
  OUT: 'Retired out',
} as const;

export interface PlayerSituationsProps {
  innings: InningsScore[];
}

/**
 * Batsmen who left the middle without being dismissed.
 *
 * These are the only player-condition facts crex publishes as data — dismissal
 * codes 11, 12 and 13 on the card. A physio walking on gets mentioned in the
 * commentary prose and nowhere else, so it is reported there, in crex's own
 * words, rather than promoted here into an official status we cannot stand
 * behind.
 */
export function PlayerSituations({ innings }: PlayerSituationsProps) {
  const rows = innings.flatMap((inn) =>
    (inn.batting ?? [])
      .filter((b) => b.retired)
      .map((b) => ({
        key: `${inn.teamId ?? inn.teamShortName}-${inn.inningsNumber ?? 1}-${b.playerId}`,
        team: inn.teamShortName,
        name: b.name,
        kind: b.retired as keyof typeof RETIREMENT_LABEL,
      }))
  );

  if (!rows.length) return null;

  return (
    <ul className={styles.situations}>
      {rows.map((row) => (
        <li key={row.key} className={styles.situation}>
          <span
            className={`${styles.situationTag} ${
              row.kind === 'OUT' ? styles.toneInfo : styles.toneSuspended
            }`}
          >
            {RETIREMENT_LABEL[row.kind]}
          </span>
          <span className={styles.situationName}>{row.name}</span>
          <span className={styles.situationTeam}>{row.team}</span>
        </li>
      ))}
    </ul>
  );
}
