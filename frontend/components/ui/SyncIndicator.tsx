import styles from './States.module.scss';

/** The branded loading signal: three beats travelling along a crease. */
export default function SyncIndicator({ label = 'Syncing live data' }: { label?: string }) {
  return (
    <span className={styles.sync} role="status">
      <span className={styles.syncBeats} aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span className={styles.syncLabel}>{label}</span>
    </span>
  );
}
