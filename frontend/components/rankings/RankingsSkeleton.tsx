import Skeleton, { stagger, staggerRows } from '../ui/Skeleton';
import { PageHeader } from '../ui/Section';
import rk from './RankingsView.module.scss';
import s from './RankingsSkeleton.module.scss';

const STEPS = [0, 1, 2];
const ROWS = Array.from({ length: 7 }, (_, i) => i);

export default function RankingsSkeleton() {
  return (
    <div className={`${rk.page} ${stagger}`} role="status" aria-busy="true" aria-label="Loading ICC rankings">
      <PageHeader eyebrow="ICC Rankings" title="Rankings" />

      <div className={rk.controls}>
        <Skeleton className={`${s.seg} ${s.seg2}`} />
        <Skeleton className={`${s.seg} ${s.seg2}`} />
        <Skeleton className={`${s.seg} ${s.seg3}`} />
        <Skeleton className={`${s.seg} ${s.seg3w}`} />
      </div>

      <div className={rk.board}>
        <ol className={rk.podium}>
          {STEPS.map((i) => (
            <li key={i} className={`${rk.step} ${s.inert}`} data-lead={i === 0 ? '' : undefined}>
              <Skeleton className={i === 0 ? s.posLg : s.pos} />
              <div className={rk.stepBody}>
                <Skeleton variant="title" width="70" />
                <Skeleton variant="text" width="40" />
              </div>
              <Skeleton className={i === 0 ? s.ratingLg : s.rating} />
              <Skeleton className={s.bar} />
            </li>
          ))}
        </ol>

        <div className={`${rk.table} ${s.inert}`}>
          <div className={staggerRows}>
            {ROWS.map((i) => (
              <div className={s.row} key={i}>
                <Skeleton variant="body" width="60" />
                <Skeleton variant="body" width={i % 3 === 0 ? '60' : i % 3 === 1 ? '80' : '50'} />
                <Skeleton variant="body" width="100" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
