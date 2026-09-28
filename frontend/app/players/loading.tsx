import Skeleton, { stagger } from '@/components/ui/Skeleton';
import dir from '@/components/player/PlayersDirectory.module.scss';
import styles from './players.module.scss';

const ROWS = [0, 1, 2, 3, 4, 5, 6, 7];

export default function Loading() {
  return (
    <div className={styles.page} role="status" aria-busy="true" aria-label="Loading players">
      <div className={styles.skHead}>
        <Skeleton variant="text" className={styles.skEyebrow} />
        <Skeleton className={styles.skTitle} />
      </div>
      <div className={dir.root}>
        <div className={dir.controls}>
          <Skeleton className={styles.skControl} />
          <Skeleton className={styles.skSearch} />
        </div>
        <div className={dir.columns}>
          {[0, 1, 2].map((c) => (
            <div key={c} className={dir.column}>
              <Skeleton variant="title" className={styles.skColTitle} />
              <div className={`${dir.panel} ${stagger}`}>
                {ROWS.map((i) => (
                  <div key={i} className={dir.row}>
                    <Skeleton className={styles.skPos} />
                    <Skeleton variant="circle" size="26" />
                    <Skeleton variant="body" width="70" />
                    <Skeleton variant="body" className={styles.skRating} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
