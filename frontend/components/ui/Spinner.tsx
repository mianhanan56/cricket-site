import styles from './Spinner.module.scss';

export default function Spinner({ label }: { label?: string }) {
  return (
    <div className={styles.wrap} role="status" aria-live="polite">
      <span className={styles.spinner} />
      {label && <span className={styles.label}>{label}</span>}
    </div>
  );
}
