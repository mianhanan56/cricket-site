import Skeleton, { stagger } from '../ui/Skeleton';
import { PageHeader } from '../ui/Section';
import page from '../../app/fixtures/fixtures.module.scss';
import ff from './FixturesFilter.module.scss';
import s from './FixturesSkeleton.module.scss';

const WEEK = [0, 1, 2, 3, 4, 5, 6];
const ROWS = [0, 1, 2, 3, 4];

export default function FixturesSkeleton() {
  return (
    <div className={page.page} role="status" aria-busy="true" aria-label="Loading fixtures">
      <PageHeader
        eyebrow="Every match"
        title="Fixtures"
        asideClassName={ff.toolbar}
        aside={
          <>
            <Skeleton className={s.menuFormat} />
            <Skeleton className={s.menuType} />
          </>
        }
      />

      <div className={ff.dates}>
        <div className={ff.weekHead}>
          <Skeleton className={s.pill} />
          <Skeleton className={s.range} />
        </div>
        <div className={`${ff.week} ${stagger}`}>
          {WEEK.map((i) => (
            <Skeleton key={i} className={s.cell} />
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
