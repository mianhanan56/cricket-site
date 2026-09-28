import Skeleton, { stagger } from '../ui/Skeleton';
import SyncIndicator from '../ui/SyncIndicator';
import { PageHeader } from '../ui/Section';
import list from '../../app/series/series.module.scss';
import detail from '../../app/series/[id]/seriesDetail.module.scss';
import filter from './SeriesFilter.module.scss';
import row from './SeriesCard.module.scss';
import s from './SeriesSkeleton.module.scss';

const ROWS = [0, 1, 2, 3, 4, 5];
const NODES = Array.from({ length: 18 }, (_, i) => i);

function RowSkeleton() {
  return (
    <div className={`${row.row} ${s.inert}`}>
      <Skeleton className={`${row.format} ${s.format}`} />
      <span className={row.main}>
        <Skeleton variant="title" className={s.name} />
        <Skeleton variant="text" className={s.dates} />
      </span>
      <span className={row.progress}>
        <Skeleton variant="text" className={s.readout} />
        <Skeleton className={s.rail} />
      </span>
      <Skeleton variant="chip" className={`${row.chip} ${s.chip}`} />
      <span className={row.go} />
    </div>
  );
}

export function SeriesListSkeleton() {
  return (
    <div className={list.page} aria-busy="true">
      <PageHeader eyebrow="Competitions" title="Series" aside={<SyncIndicator label="Loading series" />} />
      <div className={filter.toolbar}>
        <Skeleton className={s.segmented} />
        <Skeleton className={s.segmentedSm} />
      </div>
      <div className={`${filter.list} ${stagger}`}>
        {ROWS.map((i) => (
          <RowSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

export function SeriesDetailSkeleton() {
  return (
    <div className={detail.page} aria-busy="true">
      <div className={s.head}>
        <Skeleton variant="text" className={s.eyebrow} />
        <Skeleton className={s.title} />
        <SyncIndicator label="Loading series" />
      </div>

      <div className={`${detail.control} ${s.control}`}>
        <div className={detail.progress}>
          <Skeleton className={s.big} />
          <Skeleton className={s.bigRail} />
          <div className={`${detail.nodes} ${stagger}`}>
            {NODES.map((i) => (
              <Skeleton key={i} className={s.node} />
            ))}
          </div>
        </div>
        <Skeleton className={s.figures} />
      </div>

      <Skeleton className={s.tabs} />
      <div className={`${s.tiles} ${stagger}`}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className={s.tile} />
        ))}
      </div>
    </div>
  );
}

export default SeriesListSkeleton;
