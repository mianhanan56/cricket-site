import Skeleton, { stagger } from '../../components/ui/Skeleton';
import { PageHeader } from '../../components/ui/Section';
import styles from './teams.module.scss';

const TILES = Array.from({ length: 12 }, (_, i) => i);

export default function Loading() {
  return (
    <div className={styles.page} role="status" aria-busy="true" aria-label="Loading teams">
      <PageHeader eyebrow="Teams" title="International teams" />
      <ul className={`${styles.grid} ${stagger}`}>
        {TILES.map((i) => (
          <li key={i} className={styles.tile}>
            <span className={styles.tileLink}>
              <Skeleton variant="square" size="40" />
              <span className={styles.tileText}>
                <Skeleton variant="body" width={i % 2 ? '60' : '80'} />
                <Skeleton variant="text" width="30" />
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
