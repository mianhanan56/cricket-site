import type { StateFamily } from '@/lib/matchState';
import styles from './CreaseLine.module.scss';

/**
 * The signature rail: a crease line whose motion is the match state, and whose
 * fill is how far the innings has run.
 */
export default function CreaseLine({
  family,
  progress,
  className,
}: {
  family: StateFamily;
  /** 0..1 of the innings bowled, where the format fixes a length. */
  progress?: number | null;
  className?: string;
}) {
  const pct = progress == null ? null : Math.round(Math.max(0, Math.min(1, progress)) * 100);

  return (
    <span className={`${styles.line} ${styles[family] ?? ''} ${className ?? ''}`} aria-hidden="true">
      <span className={styles.track} />
      {pct !== null && (
        <svg className={styles.fillSvg} viewBox="0 0 100 2" preserveAspectRatio="none">
          <rect className={styles.fill} x="0" y="0" width={pct} height="2" />
        </svg>
      )}
      <span className={styles.signal} />
      <span className={styles.capL} />
      <span className={styles.capR} />
    </span>
  );
}
