import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { NewsArticle } from '@crex/shared';
import { getArticle, getNews } from '../../../lib/api';
import styles from './article.module.scss';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export async function generateMetadata({ params }: { params: { slug: string } }) {
  try {
    const a = await getArticle(params.slug);
    return {
      title: a.title,
      description: a.excerpt,
      openGraph: { title: a.title, description: a.excerpt, type: 'article' },
    };
  } catch {
    return { title: 'Article' };
  }
}

export default async function ArticlePage({ params }: { params: { slug: string } }) {
  let article: NewsArticle;
  try {
    article = await getArticle(params.slug);
  } catch (err) {
    if ((err as { status?: number }).status === 404) notFound();
    throw err;
  }

  // Related = other recent articles (exclude the current one).
  let related: NewsArticle[] = [];
  try {
    const all = await getNews({ limit: 6 });
    related = all.data.filter((a) => a.slug !== article.slug).slice(0, 5);
  } catch {
    /* sidebar is best-effort */
  }

  return (
    <div className={styles.page}>
      <article className={styles.article}>
        <Link href="/news" className={styles.back}>
          ← All news
        </Link>

        <h1 className={styles.title}>{article.title}</h1>

        <div className={styles.meta}>
          <span className={styles.author}>{article.author}</span>
          <span>·</span>
          <time>{formatDate(article.publishedAt)}</time>
        </div>

        {article.tags?.length > 0 && (
          <div className={styles.tags}>
            {article.tags.map((t) => (
              <span key={t} className={styles.tag}>
                {t}
              </span>
            ))}
          </div>
        )}

        {article.thumbnail && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className={styles.hero} src={article.thumbnail} alt={article.title} />
        )}

        <p className={styles.excerpt}>{article.excerpt}</p>

        <div className={styles.content}>
          {article.content.split('\n').filter(Boolean).map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
      </article>

      <aside className={styles.sidebar}>
        <h2 className={styles.sidebarTitle}>Related</h2>
        {related.length ? (
          <ul className={styles.relatedList}>
            {related.map((a) => (
              <li key={a.id}>
                <Link href={`/news/${a.slug}`} className={styles.relatedItem}>
                  <span className={styles.relatedItemTitle}>{a.title}</span>
                  <span className={styles.relatedItemDate}>{formatDate(a.publishedAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.sidebarEmpty}>No related articles.</p>
        )}
      </aside>
    </div>
  );
}
