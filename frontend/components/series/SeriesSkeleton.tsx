import Skeleton, { stagger } from '../ui/Skeleton';
import page from '../../app/series/series.module.scss';
import sf from './SeriesFilter.module.scss';
import series from './SeriesCard.module.scss';
import s from './SeriesSkeleton.module.scss';

// Six cards fills two rows of the three-column desktop grid — enough to read as
// a list without pretending to know how many series are running.
const CARDS = [0, 1, 2, 3, 4, 5];

/**
 * One series card's worth of placeholder — format chip, status pill, a two-line
 * name, and the schedule block (match count, rail, and its two date endpoints).
 *
 * Every container class is borrowed from the real SeriesCard, so the placeholder
 * occupies exactly the box the content will.
 */
export function SeriesCardSkeleton() {
  return (
    <div className={`${series.card} ${s.inert}`}>
      <div className={series.header}>
        <Skeleton className={s.formatChip} />
        <Skeleton className={s.statusPill} />
      </div>

      <div className={s.nameBlock}>
        <Skeleton variant="title" className={s.name} />
        <Skeleton variant="title" className={s.name2} />
      </div>

      <div className={series.schedule}>
        <div className={series.tally}>
          <Skeleton variant="body" className={s.count} />
        </div>
        <Skeleton className={s.rail} />
        <div className={series.span}>
          <Skeleton variant="body" className={s.date} />
          <Skeleton variant="body" className={s.date} />
        </div>
      </div>
    </div>
  );
}

/**
 * Route-level skeleton for /series.
 *
 * The heading and subhead are real: static copy, not data, and swapping a
 * placeholder for identical text would be a flicker for nothing.
 */
export default function SeriesSkeleton() {
  return (
    <div className={page.page} role="status" aria-busy="true" aria-label="Loading series">
      <header className={page.head}>
        <h1 className={page.heading}>Series</h1>
        <p className={page.sub}>
          Every competition currently in the feed, grouped from its matches.
        </p>
      </header>

      <div className={sf.tabs}>
        <Skeleton className={`${s.tabBar} ${s.tab1}`} />
        <Skeleton className={`${s.tabBar} ${s.tab2}`} />
        <Skeleton className={`${s.tabBar} ${s.tab3}`} />
        <Skeleton className={`${s.tabBar} ${s.tab4}`} />
      </div>

      <div className={`${sf.grid} ${stagger}`}>
        {CARDS.map((i) => (
          <SeriesCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
