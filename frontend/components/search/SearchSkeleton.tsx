import Skeleton, { stagger } from '../ui/Skeleton';
import page from '../../app/search/search.module.scss';
import s from './SearchSkeleton.module.scss';

/** A result group placeholder. The caller owns the role="status" announcement. */
export function SearchResultsSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className={page.section}>
      <Skeleton variant="title" className={s.sectionTitle} />
      <div className={`${page.list} ${stagger}`}>
        {Array.from({ length: rows }, (_, i) => (
          <div className={page.item} key={i}>
            <Skeleton variant="body" className={s.itemLabel} />
            <Skeleton variant="text" className={s.itemSub} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SearchSkeleton() {
  return (
    <div className={page.page} role="status" aria-busy="true" aria-label="Loading search">
      <div className={s.head}>
        <Skeleton variant="text" className={s.eyebrow} />
        <Skeleton className={s.title} />
      </div>
      <Skeleton className={s.input} />
      <SearchResultsSkeleton rows={4} />
      <SearchResultsSkeleton rows={3} />
    </div>
  );
}
