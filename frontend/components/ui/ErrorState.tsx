'use client';

import Icon from './Icon';
import styles from './States.module.scss';

export default function ErrorState({
  title = 'Live data interrupted',
  body = 'We’re reconnecting to the cricket feed.',
  onRetry,
  retrying = false,
  compact = false,
}: {
  title?: string;
  body?: string;
  onRetry?: () => void;
  retrying?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={`${styles.error} ${compact ? styles.compact : ''}`} role="alert">
      <span className={styles.brokenLine} aria-hidden="true">
        <span />
        <span />
      </span>
      <p className={styles.title}>{title}</p>
      <p className={styles.body}>{body}</p>
      {onRetry && (
        <div className={styles.actions}>
          <button type="button" className={styles.actionSecondary} onClick={onRetry} disabled={retrying}>
            <Icon name="refresh" size={16} className={retrying ? styles.spin : undefined} />
            {retrying ? 'Reconnecting' : 'Retry'}
          </button>
        </div>
      )}
    </div>
  );
}
