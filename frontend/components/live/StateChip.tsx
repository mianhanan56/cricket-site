import type { MatchStateView } from '@/lib/matchState';
import styles from './StateChip.module.scss';

export default function StateChip({
  state,
  full = false,
  className,
}: {
  state: MatchStateView;
  /** Print crex's full wording ("Toss delayed due to wet outfield") instead of the word. */
  full?: boolean;
  className?: string;
}) {
  return (
    <span className={`${styles.chip} ${styles[state.family] ?? ''} ${className ?? ''}`}>
      <span className={styles.glyph} aria-hidden="true" />
      <span className={styles.word}>{full ? state.label : state.word}</span>
    </span>
  );
}
