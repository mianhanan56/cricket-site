// Who won, and whether they chased, exists only as a result sentence — and the
// wording differs by endpoint ("Guyana Amazon Warriors won by 6 wickets" on the
// schedule, "GAW Won by 7 wickets" on the feed). A sentence that names neither
// side exactly is left unattributed, never guessed.
import type { Team } from '@/types';

const WON_BY = /\s+won\s+by\s+/i;
/** "Match tied (IND won the Super Over)": a winner with no margin. */
const SUPER_OVER = /\((.+?)\s+won\s+the\s+super\s+over\)/i;

/** A win "by N wickets" was chased; "by N runs" or "by an innings" was defended. */
export type ResultMethod = 'CHASED' | 'DEFENDED' | null;

export interface AttributedResult {
  /** The winner's team key, or null when the sentence names no side we know. */
  winnerKey: string | null;
  method: ResultMethod;
}

function namesTeam(subject: string, team: Team): boolean {
  const want = subject.trim().toLowerCase();
  if (!want) return false;
  return want === team.name.trim().toLowerCase() || want === team.shortName.trim().toLowerCase();
}

const sideNamed = (subject: string, home: Team, away: Team): Team | null =>
  namesTeam(subject, home) ? home : namesTeam(subject, away) ? away : null;

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
  const superOver = text.match(SUPER_OVER);
  if (superOver) {
    return { winnerKey: sideNamed(superOver[1], home, away)?.id ?? null, method: null };
  }
  if (!text || !WON_BY.test(text)) return { winnerKey: null, method: null };

  const [subject, rest = ''] = text.split(WON_BY, 2);
  const winner = sideNamed(subject, home, away);

  const method: ResultMethod = /wicket/i.test(rest)
    ? 'CHASED'
    : /run|innings/i.test(rest)
      ? 'DEFENDED'
      : null;

  return { winnerKey: winner?.id ?? null, method };
}
