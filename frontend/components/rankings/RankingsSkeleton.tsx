import Skeleton, { stagger, staggerRows } from '../ui/Skeleton';
import rk from './RankingsView.module.scss';
import s from './RankingsSkeleton.module.scss';

/** The three podium cards, #1 first. */
const STEPS = [0, 1, 2];

/** Ranks 4–10, the slice the standings table holds under the podium. */
const ROWS = Array.from({ length: 7 }, (_, i) => i);

/**
 * Route-level skeleton for /rankings.
 *
 * The page fetches fifteen player slices plus both team responses in parallel,
 * so this is the skeleton most likely to be seen. The h1 is real static copy;
 * the caption names the active group and format and so is a bar.
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
        <h1 className={rk.heading}>ICC Rankings</h1>
        <Skeleton variant="body" className={s.caption} />
      </header>

      {/* Four dropdown triggers — the discipline one only exists for players,
          which is the default view, so the rail is shown at its full width. */}
      <div className={rk.rail}>
        <Skeleton className={`${s.trigger} ${s.triggerMd}`} />
        <Skeleton className={`${s.trigger} ${s.triggerSm}`} />
        <Skeleton className={`${s.trigger} ${s.triggerSm}`} />
        <Skeleton className={`${s.trigger} ${s.triggerLg}`} />
      </div>

      {/* Podium — the leader keeps its mint wash, so the signature element is
          present from the first frame, just without a name in it yet. */}
      <ol className={`${rk.podium} ${s.plain}`}>
        {STEPS.map((i) => (
          <li key={i} className={`${rk.step} ${i === 0 ? rk.stepLead : ''} ${s.inert}`}>
            <div className={rk.stepTop}>
              <Skeleton variant="circle" className={s.stepRank} />
            </div>
            <div className={rk.stepBody}>
              <Skeleton variant="text" className={s.stepEyebrow} />
              <Skeleton variant="title" className={s.stepName} />
              <Skeleton variant="text" className={s.stepSub} />
            </div>
            <div className={rk.stepScore}>
              <Skeleton className={s.stepRating} />
            </div>
          </li>
        ))}
      </ol>

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
