import Skeleton, { stagger } from '../ui/Skeleton';
import page from '../../app/fixtures/fixtures.module.scss';
import ff from './FixturesFilter.module.scss';
import s from './FixturesSkeleton.module.scss';

const CHIPS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const ROWS = [0, 1, 2, 3, 4];

export default function FixturesSkeleton() {
  return (
    <div className={page.page} role="status" aria-busy="true" aria-label="Loading fixtures">
      <div className={s.head}>
        <Skeleton variant="text" className={s.eyebrow} />
        <Skeleton className={s.title} />
      </div>

      <div className={ff.toolbar}>
        <Skeleton className={s.segFormat} />
        <Skeleton className={s.segType} />
      </div>

      <div className={ff.dayBar}>
        <div className={`${s.chips} ${stagger}`}>
          {CHIPS.map((i) => (
            <Skeleton key={i} className={s.chip} />
          ))}
        </div>
      </div>

      <Skeleton variant="title" className={s.day} />
      <div className={stagger}>
        {ROWS.map((i) => (
          <div key={i} className={s.row}>
            <Skeleton variant="body" className={s.time} />
            <div className={s.body}>
              <Skeleton variant="body" width="50" />
              <Skeleton variant="text" width="70" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
