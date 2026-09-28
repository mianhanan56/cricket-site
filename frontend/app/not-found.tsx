import EmptyState from '@/components/ui/EmptyState';
import styles from './status.module.scss';

export default function NotFound() {
  return (
    <div className={styles.page}>
      <p className={styles.code}>404</p>
      <EmptyState
        icon="flag"
        title="Off the edge of the square"
        body="That page isn’t in the feed — it may have moved or never existed."
        action={{ label: 'Live matches', href: '/' }}
        secondary={{ label: 'Full schedule', href: '/fixtures' }}
      />
    </div>
  );
}
