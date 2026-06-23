import Link from 'next/link';
import { getNews, type NewsPage } from '../../lib/api';
import NewsCard from '../../components/home/NewsCard';
import styles from './news.module.scss';

export const metadata = {
  title: 'Latest News',
  description: 'The latest cricket news and analysis.',
};

const LIMIT = 9;

export default async function NewsListPage({
  searchParams,
}: {
  searchParams: { page?: string };
}) {
  const page = Math.max(1, Number(searchParams.page) || 1);

  let result: NewsPage = { data: [], page, limit: LIMIT, total: 0, totalPages: 1 };
  let failed = false;
  try {
    result = await getNews({ page, limit: LIMIT });
  } catch {
    failed = true;
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Latest News</h1>

      {failed ? (
        <p className={styles.empty}>Could not load news.</p>
      ) : result.data.length ? (
        <>
          <div className={styles.grid}>
            {result.data.map((a) => (
              <NewsCard key={a.id} article={a} />
            ))}
          </div>

          {result.totalPages > 1 && (
            <nav className={styles.pagination} aria-label="Pagination">
              <PageLink page={page - 1} disabled={page <= 1} label="← Prev" />
              <span className={styles.pageInfo}>
                Page {result.page} of {result.totalPages}
              </span>
              <PageLink
                page={page + 1}
                disabled={page >= result.totalPages}
                label="Next →"
              />
            </nav>
          )}
        </>
      ) : (
        <p className={styles.empty}>No articles yet.</p>
      )}
    </div>
  );
}

function PageLink({
  page,
  disabled,
  label,
}: {
  page: number;
  disabled: boolean;
  label: string;
}) {
  if (disabled) {
    return <span className={`${styles.pageBtn} ${styles.disabled}`}>{label}</span>;
  }
  return (
    <Link href={`/news?page=${page}`} className={styles.pageBtn}>
      {label}
    </Link>
  );
}
