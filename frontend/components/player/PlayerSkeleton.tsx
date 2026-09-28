import Skeleton, { stagger } from '../ui/Skeleton';
import page from '../../app/players/[id]/player.module.scss';
import portrait from './PlayerPortrait.module.scss';
import s from './PlayerSkeleton.module.scss';

const BARS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const ROWS = [0, 1, 2, 3, 4];
const TABLE_ROWS = [0, 1, 2, 3, 4];
const ABOUT_ROWS = [0, 1, 2, 3, 4, 5];

export default function PlayerSkeleton() {
  return (
    <div className={page.page} role="status" aria-busy="true" aria-label="Loading player">
      <Skeleton className={s.back} />

      <header className={page.hero}>
        <div className={page.heroMain}>
          <Skeleton className={portrait.portrait} />
          <div className={page.identity}>
            <Skeleton variant="text" className={s.eyebrow} />
            <Skeleton className={s.name} />
            <Skeleton variant="body" className={s.meta} />
          </div>
        </div>
        <Skeleton className={s.follow} />
      </header>

      <div className={`${page.ranks} ${stagger}`}>
        {[0, 1, 2].map((i) => (
          <div key={i} className={page.rank}>
            <Skeleton variant="text" className={s.rankLabel} />
            <Skeleton className={s.rankPos} />
          </div>
        ))}
      </div>

      <div className={page.layout}>
        <div className={page.main}>
          <section>
            <Skeleton variant="title" className={s.heading} />
            <div className={page.formPanel}>
              <div className={page.strip}>
                <div className={`${s.bars} ${stagger}`}>
                  {BARS.map((i) => (
                    <Skeleton key={i} className={s.bar} />
                  ))}
                </div>
              </div>
              {ROWS.map((i) => (
                <div key={i} className={s.row}>
                  <Skeleton variant="body" className={s.rowFig} />
                  <Skeleton variant="body" className={s.rowText} />
                </div>
              ))}
            </div>
          </section>
          <section>
            <Skeleton variant="title" className={s.heading} />
            <div className={`${page.card} ${stagger}`}>
              {TABLE_ROWS.map((i) => (
                <div key={i} className={s.row}>
                  <Skeleton variant="body" className={s.rowFig} />
                  <Skeleton variant="body" className={s.rowWide} />
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className={page.side}>
          <section>
            <Skeleton variant="title" className={s.headingSm} />
            <div className={`${page.card} ${stagger}`}>
              {ABOUT_ROWS.map((i) => (
                <div key={i} className={page.aboutRow}>
                  <Skeleton variant="text" className={s.aboutLabel} />
                  <Skeleton variant="body" className={s.aboutValue} />
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
