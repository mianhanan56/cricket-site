import styles from './Logo.module.scss';

/**
 * The mark is a popping crease seen from above — the long line and the two
 * return creases — with a signal beat running through the middle.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={`${styles.mark} ${className ?? ''}`} aria-hidden="true">
      <path className={styles.crease} d="M3 21h26" />
      <path className={styles.returns} d="M8 16v10M24 16v10" />
      <path className={styles.beat} d="M3 21h8l2.5-9 3 14 2.5-11 1.5 6H29" />
      <path className={styles.spark} d="M3 21h8l2.5-9 3 14 2.5-11 1.5 6H29" pathLength={100} />
    </svg>
  );
}

export default function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className={styles.logo}>
      <LogoMark />
      {!compact && (
        <span className={styles.word}>
          <span className={styles.pulse}>Pulse</span>
          <span className={styles.crease_}>Crease</span>
        </span>
      )}
    </span>
  );
}
