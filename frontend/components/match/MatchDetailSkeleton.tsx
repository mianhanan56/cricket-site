import Link from 'next/link';
import Skeleton, { stagger, staggerRows } from '../ui/Skeleton';
import md from './MatchDetail.module.scss';
import s from './MatchDetailSkeleton.module.scss';

const DETAIL_ROWS = ['Date', 'Time', 'Venue', 'Format', 'Series'];

/** Ragged line widths so stacked bars read as text, not as a wireframe. */
const NAME_WIDTHS: Array<'60' | '70' | '80' | '90'> = ['80', '60', '90', '70', '70', '60'];

/**
 * The batting/bowling card as a phased row grid.
 *
 * Used twice: inside the route-level skeleton below, and inside MatchDetail's
 * Scorecard tab while a crex match's card is still in flight — without it that
 * tab claims "No batting data yet" during a load it is actively doing.
 */
export function ScorecardSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className={`${md.tableWrap} ${s.inert}`}>
      <div className={`${s.tableSk} ${staggerRows}`}>
        <div className={s.batRow}>
          <Skeleton width="60" className={s.headCell} />
          <Skeleton width="50" className={s.headCell} />
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton width="70" className={`${s.headCell} ${s.right}`} key={i} />
          ))}
        </div>
        {Array.from({ length: rows }, (_, i) => (
          <div className={`${s.batRow} ${s.zebra}`} key={i}>
            <Skeleton variant="body" width={NAME_WIDTHS[i % NAME_WIDTHS.length]} />
            <Skeleton variant="text" width={i % 2 === 0 ? '80' : '60'} />
            {[0, 1, 2, 3, 4].map((c) => (
              <Skeleton variant="body" width="80" className={s.right} key={c} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** The bowling card — one column fewer than batting. */
export function BowlingSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className={`${md.tableWrap} ${s.inert}`}>
      <div className={`${s.tableSk} ${staggerRows}`}>
        <div className={s.bowlRow}>
          <Skeleton width="50" className={s.headCell} />
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton width="60" className={`${s.headCell} ${s.right}`} key={i} />
          ))}
        </div>
        {Array.from({ length: rows }, (_, i) => (
          <div className={`${s.bowlRow} ${s.zebra}`} key={i}>
            <Skeleton variant="body" width={NAME_WIDTHS[i % NAME_WIDTHS.length]} />
            {[0, 1, 2, 3, 4].map((c) => (
              <Skeleton variant="body" width="80" className={s.right} key={c} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Ball-by-ball placeholder — one over group of six deliveries.
 *
 * Also used by the Commentary tab while a crex feed is still loading.
 */
export function CommentarySkeleton({ balls = 6 }: { balls?: number }) {
  return (
    <div className={`${md.commentary} ${s.inert}`}>
      <div>
        <div className={md.overHeader}>
          <Skeleton variant="body" className={s.overHeader} />
        </div>
        <ul className={staggerRows}>
          {Array.from({ length: balls }, (_, i) => (
            <li className={md.ballRow} key={i}>
              <Skeleton className={s.ballMarker} />
              <span className={s.ballText}>
                <Skeleton variant="body" width="100" />
                <Skeleton variant="body" width={i % 2 === 0 ? '60' : '80'} />
              </span>
              <Skeleton variant="text" className={s.ballRuns} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * Route-level skeleton for /matches/[id].
 *
 * The back link is real — a reader who lands on a slow match page can leave
 * without waiting for it to resolve. Everything below it is placeholder.
 */
export default function MatchDetailSkeleton() {
  return (
    <div
      className={`${md.page} ${stagger}`}
      role="status"
      aria-busy="true"
      aria-label="Loading match centre"
    >
      <Link href="/" className={md.back}>
        ← All matches
      </Link>

      {/* Header — status, both sides with scores, series/venue line */}
      <header className={`${md.header} ${s.inert}`}>
        <div className={md.statusRow}>
          <Skeleton className={s.statusBadge} />
          <Skeleton variant="text" className={s.connLabel} />
        </div>

        <div className={md.teams}>
          <div className={md.team}>
            <Skeleton variant="body" className={s.teamName} />
            <Skeleton variant="text" className={s.teamShort} />
            <Skeleton variant="title" className={s.score} />
            <Skeleton variant="text" className={s.scoreOvers} />
          </div>
          <span className={md.vs}>
            <Skeleton variant="text" className={s.vs} />
          </span>
          <div className={`${md.team} ${md.right}`}>
            <Skeleton variant="body" className={s.teamName} />
            <Skeleton variant="text" className={s.teamShort} />
            <Skeleton variant="title" className={s.score} />
            <Skeleton variant="text" className={s.scoreOvers} />
          </div>
        </div>

        <div className={md.headerMeta}>
          <Skeleton variant="text" className={s.headerMeta} />
        </div>
      </header>

      {/* Sticky tab rail */}
      <nav className={`${md.tabs} ${s.inert}`}>
        {[0, 1, 2].map((i) => (
          <span className={s.tabCell} key={i}>
            <Skeleton variant="body" className={s.tabBar} />
          </span>
        ))}
      </nav>

      {/* Match Info panel — the tab that opens by default */}
      <div className={md.panel}>
        <section className={`${md.block} ${s.inert}`}>
          <h2 className={md.blockTitle}>
            <Skeleton variant="body" className={s.blockTitle} />
          </h2>
          {[0, 1].map((i) => (
            <div className={md.formRow} key={i}>
              <Skeleton variant="body" className={s.formTeam} />
              <div className={md.formChips}>
                {[0, 1, 2, 3, 4].map((c) => (
                  <Skeleton variant="circle" size="26" key={c} />
                ))}
              </div>
            </div>
          ))}
        </section>

        <section className={`${md.block} ${s.inert}`}>
          <h2 className={md.blockTitle}>
            <Skeleton variant="body" className={s.blockTitle} />
          </h2>
          <dl className={`${md.details} ${staggerRows}`}>
            {DETAIL_ROWS.map((label, i) => (
              <div className={md.detailRow} key={label}>
                <Skeleton variant="text" width="70" />
                <Skeleton variant="body" width={NAME_WIDTHS[i % NAME_WIDTHS.length]} />
              </div>
            ))}
          </dl>
        </section>
      </div>
    </div>
  );
}
