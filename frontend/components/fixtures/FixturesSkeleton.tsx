import Skeleton, { stagger } from '../ui/Skeleton';
import page from '../../app/fixtures/fixtures.module.scss';
import ff from './FixturesFilter.module.scss';
import s from './FixturesSkeleton.module.scss';

// Six cards fills two rows of the 3-column desktop grid — enough to read as a
// list without pretending to know how many fixtures are coming.
const CARDS = [0, 1, 2, 3, 4, 5];

function FixtureCardSkeleton() {
  return (
    <div className={`${ff.card} ${s.inert}`}>
      <div className={ff.cardTop}>
        <Skeleton variant="text" className={s.format} />
        <Skeleton variant="text" className={s.date} />
      </div>

      <div className={ff.teams}>
        <Skeleton className={s.teamCode} />
        <Skeleton variant="text" className={s.vs} />
        <Skeleton className={s.teamCode} />
      </div>

      <Skeleton variant="body" width="70" />

      <div className={ff.venue}>
        <Skeleton variant="text" width="60" />
      </div>
    </div>
  );
}

/**
 * Route-level skeleton for /fixtures.
 *
 * The heading is real: it is static copy, not data, and swapping a placeholder
 * for identical text would be a flicker for nothing.
 */
export default function FixturesSkeleton() {
  return (
    <div className={page.page} role="status" aria-busy="true" aria-label="Loading fixtures">
      <h1 className={page.heading}>Fixtures</h1>

      <div className={ff.tabs}>
        <Skeleton className={`${s.tabBar} ${s.tab1}`} />
        <Skeleton className={`${s.tabBar} ${s.tab2}`} />
        <Skeleton className={`${s.tabBar} ${s.tab3}`} />
        <Skeleton className={`${s.tabBar} ${s.tab4}`} />
      </div>

      <div className={`${ff.grid} ${stagger}`}>
        {CARDS.map((i) => (
          <FixtureCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
