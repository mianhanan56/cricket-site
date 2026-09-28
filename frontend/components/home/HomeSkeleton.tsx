import Skeleton, { stagger } from '../ui/Skeleton';
import SyncIndicator from '../ui/SyncIndicator';
import page from '../../app/page.module.scss';
import s from './HomeSkeleton.module.scss';

export function HeroSkeleton() {
  return (
    <div className={s.hero} role="status" aria-label="Loading live cricket">
      <div className={s.heroTop}>
        <SyncIndicator />
      </div>
      <div className={s.heroMain}>
        <div className={s.heroScore}>
          <Skeleton variant="title" className={s.team} />
          <Skeleton className={s.bigScore} />
          <Skeleton variant="body" className={s.equation} />
          <div className={s.tiles}>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className={s.tile} />
            ))}
          </div>
          <span className={s.trace} />
        </div>
        <div className={s.heroSide}>
          <Skeleton className={s.panel} />
          <Skeleton className={s.panel} />
        </div>
      </div>
    </div>
  );
}

export function BoardSkeleton() {
  return (
    <div className={`${s.board} ${stagger}`} aria-hidden="true">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className={s.tile2}>
          <Skeleton variant="text" className={s.line1} />
          <div className={s.row}>
            <Skeleton variant="square" size="26" />
            <Skeleton variant="body" className={s.code} />
            <Skeleton variant="title" className={s.score} />
          </div>
          <div className={s.row}>
            <Skeleton variant="square" size="26" />
            <Skeleton variant="body" className={s.code} />
            <Skeleton variant="title" className={s.score} />
          </div>
          <span className={s.crease} />
        </div>
      ))}
    </div>
  );
}

export default function HomeSkeleton() {
  return (
    <div className={page.page}>
      <HeroSkeleton />
      <div className={s.gap} />
      <BoardSkeleton />
    </div>
  );
}
