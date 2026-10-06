import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { NewsPage } from '@/types';
import { getLatestNews, NEWS_MAX_PAGE } from '@/lib/news';
import { NewsGrid, NewsLead } from '../../components/news/NewsList';
import { PageHeader } from '../../components/ui/Section';
import EmptyState from '../../components/ui/EmptyState';
import Icon from '../../components/ui/Icon';
import styles from './news.module.scss';

/** null for a value that isn't a page number at all; past-the-end pages are the caller's call. */
function readPage(raw: string | string[] | undefined): number | null {
  if (raw === undefined) return 1;
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

export function generateMetadata({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const page = readPage(searchParams?.page) ?? 1;
  return {
    title: page > 1 ? `Cricket News — Page ${page}` : 'Cricket News',
    description: 'The latest cricket news — team announcements, squads, previews and reaction.',
  };
}

const pageHref = (page: number) => (page <= 1 ? '/news' : `/news?page=${page}`);

export default async function NewsPageView({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const page = readPage(searchParams?.page);
  if (page === null) redirect('/news');
  if (page > NEWS_MAX_PAGE) notFound();

  const data: NewsPage | null = await getLatestNews(page).catch(() => null);
  if (data && !data.articles.length && page > 1) notFound();

  const header = <PageHeader eyebrow={page > 1 ? `News · Page ${page}` : 'News'} title={page > 1 ? 'Earlier news' : 'Latest news'} />;

  if (!data?.articles.length) {
    return (
      <div className={styles.page}>
        {header}
        <EmptyState
          icon="news"
          title="News isn’t loading right now"
          action={{ label: 'Try again', href: pageHref(page) }}
          secondary={{ label: 'Live matches', href: '/' }}
        />
      </div>
    );
  }

  const [lead, ...rest] = data.articles;
  const rows = page === 1 ? rest : data.articles;

  return (
    <div className={styles.page}>
      {header}

      {page === 1 && <NewsLead article={lead} />}
      {rows.length > 0 && (
        <div className={styles.list}>
          <NewsGrid articles={rows} level={2} />
        </div>
      )}

      {(page > 1 || data.hasNext) && (
        <nav className={styles.pager} aria-label="News pages">
          {page > 1 && (
            <Link href={pageHref(page - 1)} className={styles.pageLink} rel="prev">
              <Icon name="chevronLeft" size={18} />
              Newer
            </Link>
          )}
          {data.hasNext && (
            <Link href={pageHref(page + 1)} className={`${styles.pageLink} ${styles.older}`} rel="next">
              Older
              <Icon name="chevronRight" size={18} />
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
