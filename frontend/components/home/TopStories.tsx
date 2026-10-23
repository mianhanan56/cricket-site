import Link from 'next/link';
import type { NewsArticle } from '@/types';
import { getLatestNews, newsImage } from '@/lib/news';
import LocalTime from '../ui/LocalTime';
import Skeleton from '../ui/Skeleton';
import { SectionHead } from '../ui/Section';
import styles from './TopStories.module.scss';

const SHOWN = 5;

function Story({ article, lead }: { article: NewsArticle; lead?: boolean }) {
  const src = lead ? article.image : newsImage(article.image ?? undefined, 'lq') ?? article.image;
  return (
    <article className={`${styles.story} ${lead ? styles.lead : ''} ${src ? '' : styles.bare}`}>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element -- crex's CDN already serves resized WebP
        <img
          className={styles.image}
          src={src}
          alt=""
          width={lead ? 640 : 320}
          height={lead ? 360 : 180}
          loading={lead ? 'eager' : 'lazy'}
          decoding="async"
        />
      )}
      <div className={styles.body}>
        {article.category && <span className={styles.category}>{article.category}</span>}
        <h3 className={styles.title}>
          <Link href={`/news/${article.slug}`} className={styles.link}>
            {article.title}
          </Link>
        </h3>
        {lead && article.excerpt && <p className={styles.excerpt}>{article.excerpt}</p>}
        <LocalTime iso={article.publishedAt} format="dayTime" className={styles.time} />
      </div>
    </article>
  );
}

/** The latest news on the home page. Renders nothing when news doesn't load. */
export default async function TopStories() {
  const data = await getLatestNews(1).catch(() => null);
  const articles = data?.articles.slice(0, SHOWN) ?? [];
  if (!articles.length) return null;
  const [lead, ...rest] = articles;

  return (
    <section className={styles.section} aria-labelledby="stories-title">
      <SectionHead id="stories-title" title="Top stories" action={{ href: '/news', label: 'All news' }} />
      <div className={styles.grid}>
        <Story article={lead} lead />
        {rest.map((a) => (
          <Story key={a.id} article={a} />
        ))}
      </div>
    </section>
  );
}

export function TopStoriesSkeleton() {
  return (
    <section className={styles.section} aria-busy="true" aria-label="Loading top stories">
      <Skeleton variant="title" width="20" />
      <div className={styles.grid}>
        <Skeleton className={styles.skLead} />
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className={styles.skStory} />
        ))}
      </div>
    </section>
  );
}
