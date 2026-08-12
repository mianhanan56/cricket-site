import Skeleton, { stagger } from '../ui/Skeleton';
import page from '../../app/page.module.scss';
import home from './HomeMatches.module.scss';
import card from './MatchCard.module.scss';
import series from './SeriesCard.module.scss';
import s from './HomeSkeleton.module.scss';

// The carousel shows 3 cards on desktop, 2 on tablet, 1 on mobile. Rendering 3
// fills the widest case; the rest sit off the edge of the track exactly as real
// cards do.
const CARDS = [0, 1, 2];
const STATS = [0, 1, 2, 3];

/**
 * One match card's worth of placeholder — header chips, two team rows with
 * badge + code + score, and the footer note/venue line.
 *
 * Exported because the home page needs it twice: as part of the route-level
 * skeleton below, and inside HomeMatches when the crex poll is the only source
 * of matches and hasn't landed yet.
 */
export function MatchCardSkeleton() {
  return (
    <div className={`${card.card} ${s.inert}`}>
      <div className={card.header}>
        <div className={card.headLeft}>
          <Skeleton className={s.formatChip} />
          <Skeleton variant="text" className={s.seriesBar} />
        </div>
        <Skeleton variant="text" className={s.statusBar} />
      </div>

      <div className={card.teams}>
        {[0, 1].map((i) => (
          <div className={card.team} key={i}>
            <div className={card.teamLeft}>
              <Skeleton variant="square" size="44" />
              <div className={s.teamMeta}>
                <Skeleton variant="body" className={s.teamCode} />
                <Skeleton variant="text" className={s.teamName} />
              </div>
            </div>
            <Skeleton variant="title" className={s.score} />
          </div>
        ))}
      </div>

      <div className={card.footer}>
        <Skeleton variant="body" className={s.footNote} />
        <div className={card.meta}>
          <Skeleton variant="text" className={s.venue} />
        </div>
      </div>
    </div>
  );
}

/**
 * The series equivalent — same glass shell, series-shaped content.
 *
 * The Series tab rolls its list up from the same polled match feed, so it has
 * the same first-load gap to cover.
 */
export function SeriesCardSkeleton() {
  return (
    <div className={`${series.card} ${s.inert}`}>
      <div className={series.header}>
        <Skeleton className={s.formatChip} />
        <Skeleton className={s.statusPill} />
      </div>

      <Skeleton variant="title" className={s.seriesName} />
      <Skeleton variant="title" className={s.seriesName2} />

      <div className={series.dates}>
        <Skeleton variant="body" className={s.seriesDates} />
      </div>

      <div className={series.footer}>
        <Skeleton variant="body" className={s.seriesCount} />
      </div>
    </div>
  );
}

/**
 * The carousel track filled with card placeholders, phased left to right.
 *
 * `kind` picks which card shape fills it, so the placeholder always matches the
 * tab the reader is actually looking at.
 */
export function MatchCarouselSkeleton({
  count = 3,
  kind = 'match',
}: {
  count?: number;
  kind?: 'match' | 'series';
}) {
  return (
    <div className={home.slider}>
      <div className={`${home.track} ${stagger}`}>
        {Array.from({ length: count }, (_, i) => (
          <div className={home.slide} key={i}>
            {kind === 'series' ? <SeriesCardSkeleton /> : <MatchCardSkeleton />}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function HomeSkeleton() {
  return (
    <div className={page.page} role="status" aria-busy="true" aria-label="Loading live scores">
      {/* Stats strip */}
      <div className={`${home.stats} ${stagger}`}>
        {STATS.map((i) => (
          <div className={`${home.stat} ${s.inert}`} key={i}>
            <Skeleton variant="square" size="40" />
            <span className={`${home.statBody} ${s.statBody}`}>
              <Skeleton variant="title" className={s.statValue} />
              <Skeleton variant="text" className={s.statLabel} />
            </span>
          </div>
        ))}
      </div>

      {/* Section head — title + the tab rail, still on its glass bed */}
      <div className={home.head}>
        <div className={home.headLeft}>
          <Skeleton variant="title" className={s.headTitle} />
        </div>
        <div className={home.pills}>
          <Skeleton className={`${s.pillBar} ${s.pill1}`} />
          <Skeleton className={`${s.pillBar} ${s.pill2}`} />
          <Skeleton className={`${s.pillBar} ${s.pill3}`} />
          <Skeleton className={`${s.pillBar} ${s.pill4}`} />
        </div>
      </div>

      <MatchCarouselSkeleton count={CARDS.length} />
    </div>
  );
}
