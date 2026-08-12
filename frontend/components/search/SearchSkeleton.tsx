import Skeleton, { stagger } from '../ui/Skeleton';
import page from '../../app/search/search.module.scss';
import s from './SearchSkeleton.module.scss';

/**
 * A result group placeholder — a section heading over a card of rows.
 *
 * This is what shows while a query is in flight, in place of a "Searching…"
 * line: the rows land where the results will, so the answer doesn't shove the
 * page around when it arrives.
 *
 * Purely visual — the caller owns the `role="status"` announcement, so stacking
 * two of these never nests live regions.
 */
export function SearchResultsSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <section className={page.section}>
      <h2 className={page.sectionTitle}>
        <Skeleton className={s.sectionTitle} />
      </h2>
      <div className={`${page.list} ${stagger} ${s.inert}`}>
        {Array.from({ length: rows }, (_, i) => (
          <div className={page.item} key={i}>
            <Skeleton variant="body" className={s.itemLabel} />
            <Skeleton variant="text" className={s.itemSub} />
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Route-level skeleton for /search.
 *
 * The heading is real static copy; the field is a placeholder because the input
 * is client-side and can't take a keystroke yet — showing a live-looking box
 * that swallows typing would be worse than showing it as pending.
 */
export default function SearchSkeleton() {
  return (
    <div className={page.page} role="status" aria-busy="true" aria-label="Loading search">
      <h1 className={page.heading}>Search</h1>
      <Skeleton className={s.input} />
      <SearchResultsSkeleton rows={4} />
      <SearchResultsSkeleton rows={3} />
    </div>
  );
}
