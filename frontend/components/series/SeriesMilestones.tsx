import { getApiSeriesStatTables } from '@/lib/api';
import Skeleton from '../ui/Skeleton';
import MilestoneLeaders from './MilestoneLeaders';
import styles from './MilestoneLeaders.module.scss';

// Read off every card in the series, so cached as hard as the full ranking pages.
const REVALIDATE = 900;
const SHOWN = 5;

export default async function SeriesMilestones({ seriesId }: { seriesId: string }) {
  const tables = await getApiSeriesStatTables(seriesId, ['FIFTIES', 'HUNDREDS'], {
    limit: SHOWN,
    revalidate: REVALIDATE,
  }).catch(() => null);
  if (!tables) return null;

  return (
    <MilestoneLeaders
      tables={{ FIFTIES: tables.FIFTIES ?? null, HUNDREDS: tables.HUNDREDS ?? null }}
      seriesId={seriesId}
    />
  );
}

export function MilestonesSkeleton() {
  return (
    <>
      {[0, 1].map((card) => (
        <div key={card} className={styles.card} aria-busy="true" aria-label="Loading milestone rankings">
          <Skeleton variant="text" width="40" />
          {Array.from({ length: SHOWN }, (_, i) => (
            <Skeleton key={i} className={styles.skRow} />
          ))}
        </div>
      ))}
    </>
  );
}
