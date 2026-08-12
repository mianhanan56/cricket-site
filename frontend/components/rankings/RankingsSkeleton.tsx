import Skeleton, { stagger, staggerRows } from '../ui/Skeleton';
import rk from './RankingsView.module.scss';
import s from './RankingsSkeleton.module.scss';

// Ranks 2–10, the slice the standings table holds under the spotlight.
const ROWS = Array.from({ length: 9 }, (_, i) => i);

/**
 * Route-level skeleton for /rankings.
 *
 * The page fetches 18 format × gender × category slices in parallel, so this is
 * the skeleton most likely to be seen. The h1 is real static copy; the caption
 * names the active format and so is a bar.
 */
export default function RankingsSkeleton() {
  return (
    <div
      className={`${rk.page} ${stagger}`}
      role="status"
      aria-busy="true"
      aria-label="Loading ICC rankings"
    >
      <header className={rk.head}>
        <div className={rk.headText}>
          <h1 className={rk.heading}>ICC Rankings</h1>
          <Skeleton variant="body" className={s.caption} />
        </div>
        <div className={rk.segment}>
          <Skeleton className={`${s.segmentBar} ${s.segmentSm}`} />
          <Skeleton className={`${s.segmentBar} ${s.segmentSm}`} />
        </div>
      </header>

      <div className={rk.controls}>
        <div className={rk.segment}>
          <Skeleton className={`${s.segmentBar} ${s.segmentSm}`} />
          <Skeleton className={`${s.segmentBar} ${s.segmentMd}`} />
          <Skeleton className={`${s.segmentBar} ${s.segmentMd}`} />
        </div>
        <nav className={rk.pills}>
          <Skeleton className={`${s.pillBar} ${s.pill1}`} />
          <Skeleton className={`${s.pillBar} ${s.pill2}`} />
          <Skeleton className={`${s.pillBar} ${s.pill3}`} />
        </nav>
      </div>

      {/* Leader spotlight — keeps its mint wash so the signature element is
          present from the first frame, just without a name in it yet. */}
      <div className={`${rk.leader} ${s.inert}`}>
        <Skeleton variant="circle" className={s.leaderRing} />
        <div className={rk.leaderMain}>
          <Skeleton variant="text" className={s.leaderEyebrow} />
          <Skeleton variant="title" className={s.leaderName} />
          <Skeleton variant="text" className={s.leaderCountry} />
        </div>
        <div className={rk.leaderScore}>
          <Skeleton className={s.leaderRating} />
          <Skeleton variant="text" className={s.leaderRatingLabel} />
        </div>
      </div>

      <div className={`${rk.tableWrap} ${s.inert}`}>
        <div className={`${s.row} ${s.headRow}`}>
          <Skeleton variant="text" width="80" />
          <Skeleton variant="text" width="25" />
          <Skeleton variant="text" width="40" />
          <Skeleton variant="text" width="60" className={s.right} />
        </div>
        <div className={staggerRows}>
          {ROWS.map((i) => (
            <div className={s.row} key={i}>
              <Skeleton variant="body" width="70" />
              <Skeleton variant="body" width={i % 3 === 0 ? '70' : i % 3 === 1 ? '90' : '60'} />
              <Skeleton variant="text" width={i % 2 === 0 ? '70' : '50'} />
              <Skeleton variant="body" width="80" className={s.right} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
