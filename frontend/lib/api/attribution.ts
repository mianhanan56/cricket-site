// Who won, and whether they chased, exists only as a result sentence — and the
// wording differs by endpoint ("Guyana Amazon Warriors won by 6 wickets" on the
// schedule, "GAW Won by 7 wickets" on the feed). A sentence that names neither
// side exactly is left unattributed, never guessed.
import type { Team } from '@/types';

const WON_BY = /\s+won\s+by\s+/i;

/** A win "by N wickets" was chased; "by N runs" or "by an innings" was defended. */
export type ResultMethod = 'CHASED' | 'DEFENDED' | null;

export interface AttributedResult {
  /** f_key of the winner, or null when the sentence names no side we know. */
  winnerKey: string | null;
  method: ResultMethod;
}

function namesTeam(subject: string, team: Team): boolean {
  const want = subject.trim().toLowerCase();
  if (!want) return false;
  return want === team.name.trim().toLowerCase() || want === team.shortName.trim().toLowerCase();
}

/**
 * Read a result sentence against the two sides. Exact name matches only: a loose
 * match files one "St …" side's win as another's and quietly poisons a head-to-head.
 */
export function attributeResult(
  result: string | null | undefined,
  home: Team,
  away: Team
): AttributedResult {
  const text = (result ?? '').trim();
  if (!text || !WON_BY.test(text)) return { winnerKey: null, method: null };

  const [subject, rest = ''] = text.split(WON_BY, 2);
  const winner = namesTeam(subject, home) ? home : namesTeam(subject, away) ? away : null;

  const method: ResultMethod = /wicket/i.test(rest)
    ? 'CHASED'
    : /run|innings/i.test(rest)
      ? 'DEFENDED'
      : null;

  return { winnerKey: winner?.id ?? null, method };
}
