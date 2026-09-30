import Skeleton, { stagger, staggerRows } from '../ui/Skeleton';
import SyncIndicator from '../ui/SyncIndicator';
import mc from './matchCenter.module.scss';
import s from './MatchDetailSkeleton.module.scss';

const NAME_WIDTHS: Array<'60' | '70' | '80' | '90'> = ['80', '60', '90', '70', '70', '60'];

export function ScorecardSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className={`${mc.tableWrap} ${s.table} ${staggerRows}`} aria-hidden="true">
      {Array.from({ length: rows + 1 }, (_, i) => (
        <div className={s.row} key={i}>
          <Skeleton variant="body" width={NAME_WIDTHS[i % NAME_WIDTHS.length]} />
          {[0, 1, 2, 3, 4].map((c) => (
            <Skeleton variant="body" key={c} className={s.cell} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function BowlingSkeleton({ rows = 4 }: { rows?: number }) {
  return <ScorecardSkeleton rows={rows} />;
}

export function CommentarySkeleton({ balls = 6, card = true }: { balls?: number; card?: boolean }) {
  return (
    <div className={s.feed} aria-hidden="true">
      {card && (
        <div className={s.overCard}>
          <Skeleton variant="body" className={s.overTitle} />
          <div className={s.overBalls}>
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} variant="circle" size="26" />
            ))}
          </div>
        </div>
      )}
      <ul className={staggerRows}>
        {Array.from({ length: balls }, (_, i) => (
          <li className={s.ball} key={i}>
            <Skeleton variant="text" className={s.at} />
            <span className={s.text}>
              <Skeleton variant="text" width="20" />
              <Skeleton variant="body" width={i % 2 === 0 ? '90' : '70'} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function MatchDetailSkeleton() {
  return (
    <div className={`${s.page} ${stagger}`} role="status" aria-busy="true" aria-label="Loading match centre">
      <div className={s.header}>
        <SyncIndicator label="Loading match" />
        <div className={s.teams}>
          {[0, 1].map((i) => (
            <div key={i} className={s.side}>
              <Skeleton variant="body" className={s.team} />
              <Skeleton className={s.score} />
            </div>
          ))}
        </div>
        <span className={s.crease} />
      </div>
      <div className={s.rail}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} variant="body" className={s.tab} />
        ))}
      </div>
      <div className={s.body}>
        <Skeleton className={s.block} />
        <Skeleton className={s.block} />
      </div>
    </div>
  );
}
