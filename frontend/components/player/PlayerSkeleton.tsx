import Skeleton, { stagger } from '../ui/Skeleton';
import page from '../../app/players/[id]/player.module.scss';
import portrait from './PlayerPortrait.module.scss';
import s from './PlayerSkeleton.module.scss';

// Ten tiles, because that is exactly how many innings crex returns — the rail
// should not resize when the real form arrives.
const TILES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const ABOUT_ROWS = [0, 1, 2, 3, 4, 5];
const TABLE_ROWS = [0, 1, 2, 3];

/**
 * Route-level skeleton for a player profile.
 *
 * Every container class is borrowed from the real page and portrait, so the
 * placeholder occupies the boxes the profile will: the header does not jump when
 * the portrait loads, and the form rail is already ten tiles wide.
 */
export default function PlayerSkeleton() {
  return (
    <div className={page.page} role="status" aria-busy="true" aria-label="Loading player">
      <header className={page.head}>
        <Skeleton className={`${portrait.portrait} ${s.inert}`} />
        <div className={page.identity}>
          <Skeleton variant="display" className={s.name} />
          <div className={s.meta}>
            <Skeleton className={s.metaBar} />
            <Skeleton className={s.metaBar} />
          </div>
          <div className={page.ranks}>
            <Skeleton className={s.rank} />
            <Skeleton className={s.rank} />
          </div>
        </div>
      </header>

      <section className={`${page.block} ${s.inert}`}>
        <Skeleton variant="title" className={s.blockTitle} />
        <div className={page.formGroup}>
          <Skeleton className={s.formTitle} />
          <div className={`${page.formRail} ${stagger}`}>
            {TILES.map((i) => (
              <Skeleton key={i} className={s.formTile} />
            ))}
          </div>
        </div>
      </section>

      <section className={`${page.block} ${s.inert}`}>
        <Skeleton variant="title" className={s.blockTitle} />
        <div className={`${page.about} ${stagger}`}>
          {ABOUT_ROWS.map((i) => (
            <div key={i} className={page.aboutRow}>
              <Skeleton className={s.aboutLabel} />
              <Skeleton className={s.aboutValue} />
            </div>
          ))}
        </div>
      </section>

      <section className={`${page.block} ${s.inert}`}>
        <Skeleton variant="title" className={s.blockTitle} />
        <div className={stagger}>
          {TABLE_ROWS.map((i) => (
            <Skeleton key={i} className={s.tableRow} />
          ))}
        </div>
      </section>
    </div>
  );
}
