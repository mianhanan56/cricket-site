import type { MatchSquads } from '@/types';
import styles from './PlayerMarks.module.scss';

export interface PlayerRoleMarks {
  captain: boolean;
  keeper: boolean;
}

export function roleMarksFrom(squads: MatchSquads | null): Map<string, PlayerRoleMarks> {
  const marks = new Map<string, PlayerRoleMarks>();
  for (const p of [...(squads?.home ?? []), ...(squads?.away ?? [])]) {
    if (p.isCaptain || p.role === 'WK') marks.set(p.id, { captain: !!p.isCaptain, keeper: p.role === 'WK' });
  }
  return marks;
}

export default function PlayerMarks({ captain, keeper }: Partial<PlayerRoleMarks>) {
  if (!captain && !keeper) return null;
  return (
    <span className={styles.marks}>
      {captain && <span className={`${styles.mark} ${styles.captain}`}>Captain</span>}
      {keeper && <span className={`${styles.mark} ${styles.keeper}`}>Wicket-keeper</span>}
    </span>
  );
}
