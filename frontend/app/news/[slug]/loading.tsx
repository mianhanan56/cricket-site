import Skeleton from '../../../components/ui/Skeleton';
import styles from './story.module.scss';

export default function Loading() {
  return (
    <div className={styles.page} role="status" aria-busy="true" aria-label="Loading story">
      <div className={styles.story}>
        <div className={styles.head}>
          <Skeleton variant="text" width="20" />
          <Skeleton variant="display" width="90" />
          <Skeleton variant="display" width="60" />
          <Skeleton variant="text" width="30" />
        </div>
        <Skeleton className={styles.image} />
        <Skeleton variant="body" width="100" />
        <Skeleton variant="body" width="80" />
      </div>
    </div>
  );
}
