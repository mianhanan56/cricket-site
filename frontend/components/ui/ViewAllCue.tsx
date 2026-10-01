import Icon from './Icon';
import styles from './ViewAllCue.module.scss';

/**
 * "View all →" inside a card that is itself the link to the full list — a cue,
 * not a second link, so it is hidden from assistive tech (the card's own name
 * already says where it goes).
 */
export default function ViewAllCue({ label = 'View all' }: { label?: string }) {
  return (
    <span className={styles.cue} aria-hidden="true">
      {label}
      <Icon name="arrowRight" size={14} />
    </span>
  );
}
