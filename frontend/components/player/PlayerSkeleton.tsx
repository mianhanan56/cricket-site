import Skeleton, { stagger } from '../ui/Skeleton';
import page from '../../app/player/[id]/player.module.scss';
import ps from './PlayerStatsTabs.module.scss';
import s from './PlayerSkeleton.module.scss';

// The batting tab — the default — carries ten figures.
const STATS = Array.from({ length: 10 }, (_, i) => i);
const MATCHES = [0, 1, 2, 3, 4];

/**
 * Route-level skeleton for /player/[id].
 *
 * Section headings are real: "Career Stats" and "Recent Matches" always render,
 * whatever the profile turns out to hold, so there is nothing to guess at.
 */
export default function PlayerSkeleton() {
  return (
    <div className={page.page} role="status" aria-busy="true" aria-label="Loading player profile">
      <section className={page.hero}>
        <Skeleton variant="circle" size="96" />
        <div className={page.heroInfo}>
          <Skeleton variant="text" className={s.flag} />
          <Skeleton className={s.name} />
          <div className={page.badges}>
            <Skeleton className={s.roleBadge} />
            <Skeleton className={s.styleBadge} />
          </div>
        </div>
      </section>

      <section className={page.block}>
        <h2 className={page.blockTitle}>Career Stats</h2>
        <div className={ps.tabs}>
          <Skeleton className={s.tabBar} />
          <Skeleton className={s.tabBar} />
        </div>
        <div className={`${ps.statGrid} ${stagger}`}>
          {STATS.map((i) => (
            <div className={`${ps.statCard} ${s.inert}`} key={i}>
              <Skeleton variant="title" className={s.statValue} />
              <Skeleton variant="text" className={s.statLabel} />
            </div>
          ))}
        </div>
      </section>

      <section className={page.block}>
        <h2 className={page.blockTitle}>Recent Matches</h2>
        <div className={`${page.matchList} ${stagger}`}>
          {MATCHES.map((i) => (
            <div className={`${page.matchItem} ${s.inert}`} key={i}>
              <Skeleton variant="body" className={s.matchTeams} />
              <Skeleton variant="text" className={s.matchMeta} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
