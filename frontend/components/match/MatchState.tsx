// The match-state vocabulary — one word for what is happening right now, shared by
// the home cards and the detail page so the two never disagree — plus the list of
// batsmen who have left the middle without being dismissed.
//
// Deliberately a word rather than a component. Every surface that shows the state
// has its own type scale: a 12px label on a carousel card, something quieter in a
// page header. A shared badge ended up too heavy for the header and the page wore
// two different status treatments at once. The wording is the part that has to be
// identical; how it is set belongs to the surface showing it.

import type { InningsScore, MatchNote, MatchNoteKind, MatchStatus } from '@/types';
import styles from './MatchState.module.scss';

// --- Status vocabulary ------------------------------------------------------

/**
 * One word per kind of stoppage.
 *
 * A match card has room for a word, not a sentence: "STUMPS" and "DELAY" are what
 * a reader scanning a carousel needs, and the difference between a drinks break
 * and a tea break is not worth a line of a card. The full wording — "Tea Break",
 * "Toss delayed due to wet outfield" — is on the match page, one tap away.
 *
 * `INFO` has no word because it is the kind for a status crex sent that this
 * vocabulary does not recognise; inventing one for it would be guessing.
 */
const NOTE_WORD: Partial<Record<MatchNoteKind, string>> = {
  BREAK: 'BREAK',
  STUMPS: 'STUMPS',
  DELAY: 'DELAY',
  SUSPENDED: 'SUSPENDED',
};

/**
 * The single word for a live match that has stopped, or null when there is none —
 * play is going on, the match is not live, or crex sent something unrecognised.
 *
 * Exported because the home cards and the detail header must not name the same
 * state differently.
 */
export function pausedWord(status: MatchStatus, note?: MatchNote | null): string | null {
  if (status !== 'LIVE' || !note?.paused) return null;
  return NOTE_WORD[note.kind] ?? null;
}

// --- Player situations ------------------------------------------------------

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
