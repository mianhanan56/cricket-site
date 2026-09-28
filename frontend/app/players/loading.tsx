import Skeleton, { stagger } from '@/components/ui/Skeleton';
import dir from '@/components/player/PlayersDirectory.module.scss';
import styles from './players.module.scss';

const ROWS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

export default function Loading() {
  return (
    <div className={styles.page} role="status" aria-busy="true" aria-label="Loading players">
      <div className={styles.skHead}>
        <Skeleton variant="text" className={styles.skEyebrow} />
        <Skeleton className={styles.skTitle} />
      </div>
      <div className={dir.root}>
        <div className={dir.controls}>
          <div className={dir.filters}>
            <Skeleton className={styles.skGender} />
            <Skeleton className={styles.skRole} />
            <Skeleton className={styles.skFormat} />
          </div>
          <Skeleton className={styles.skSearch} />
        </div>
        <div className={dir.sections}>
          <div>
            <Skeleton variant="title" className={styles.skSectionTitle} />
            <div className={`${dir.panel} ${stagger}`}>
              {ROWS.map((i) => (
                <div key={i} className={dir.row}>
                  <Skeleton className={styles.skRank} />
                  <Skeleton variant="circle" size="26" className={dir.crest} />
                  <Skeleton variant="body" width="70" className={styles.skName} />
                  <Skeleton variant="body" className={styles.skRating} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
