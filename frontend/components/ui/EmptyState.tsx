import Link from 'next/link';
import Icon, { type IconName } from './Icon';
import styles from './States.module.scss';

export interface StateAction {
  label: string;
  href?: string;
  onClick?: () => void;
}

function Action({ action, primary }: { action: StateAction; primary?: boolean }) {
  const cls = primary ? styles.actionPrimary : styles.actionSecondary;
  return action.href ? (
    <Link href={action.href} className={cls}>
      {action.label}
    </Link>
  ) : (
    <button type="button" className={cls} onClick={action.onClick}>
      {action.label}
    </button>
  );
}

/**
 * A quiet state with somewhere to go next. The crease line under the icon is
 * flat — nothing is happening here.
 */
export default function EmptyState({
  icon = 'signal',
  title,
  body,
  action,
  secondary,
  compact = false,
}: {
  icon?: IconName;
  title: string;
  body?: string;
  action?: StateAction;
  secondary?: StateAction;
  compact?: boolean;
}) {
  return (
    <div className={`${styles.empty} ${compact ? styles.compact : ''}`}>
      <span className={styles.emptyIcon} aria-hidden="true">
        <Icon name={icon} size={compact ? 18 : 22} />
      </span>
      <span className={styles.flatline} aria-hidden="true" />
      <p className={styles.title}>{title}</p>
      {body && <p className={styles.body}>{body}</p>}
      {(action || secondary) && (
        <div className={styles.actions}>
          {action && <Action action={action} primary />}
          {secondary && <Action action={secondary} />}
        </div>
      )}
    </div>
  );
}
