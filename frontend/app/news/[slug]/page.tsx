import { cache } from 'react';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { getNewsStory, newsTagHref } from '@/lib/news';
import { NewsGrid } from '../../../components/news/NewsList';
import BackButton from '../../../components/ui/BackButton';
import LocalTime from '../../../components/ui/LocalTime';
import { SectionHead } from '../../../components/ui/Section';
import styles from './story.module.scss';

// cache(): generateMetadata and the page share one read per request.
const loadStory = cache(getNewsStory);

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const story = await loadStory(params.slug).catch(() => null);
  if (!story) return { title: 'News' };
  const { article } = story;
  return {
    title: article.title,
    description: article.excerpt ?? undefined,
    openGraph: {
      type: 'article',
      title: article.title,
      description: article.excerpt ?? undefined,
      publishedTime: article.publishedAt,
      images: article.image ? [article.image] : undefined,
    },
  };
}

export default async function NewsStoryPage({ params }: { params: { slug: string } }) {
  const story = await loadStory(params.slug);
  if (!story) notFound();
  const { article, related } = story;
  // The id alone finds the story; a stale or hand-typed slug moves to the real one.
  if (article.slug !== params.slug) permanentRedirect(`/news/${article.slug}`);

  return (
    <div className={styles.page}>
      <BackButton fallback="/news" className={styles.back} />

      <article className={styles.story}>
        <header className={styles.head}>
          <span className={styles.eyebrow}>{article.category ?? 'News'}</span>
          <h1 className={styles.title}>{article.title}</h1>
          <p className={styles.meta}>
            {article.author && <span>{article.author}</span>}
            <LocalTime iso={article.publishedAt} format="dayTime" />
          </p>
        </header>

        {article.image && (
          <figure className={styles.figure}>
            {/* eslint-disable-next-line @next/next/no-img-element -- the upstream's CDN already serves resized WebP */}
            <img src={article.image} alt={article.imageCaption ?? ''} width={1280} height={720} className={styles.image} />
            {article.imageCaption && <figcaption className={styles.caption}>{article.imageCaption}</figcaption>}
          </figure>
        )}

        {article.excerpt && <p className={styles.standfirst}>{article.excerpt}</p>}

        {article.tags.length > 0 && (
          <ul className={styles.tags} aria-label="In this story">
            {article.tags.map((t) => (
              <li key={`${t.kind}-${t.id}`}>
                <Link href={newsTagHref(t)} className={styles.tag}>
                  {t.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </article>

      {related.length > 0 && (
        <section className={styles.related} aria-labelledby="more-news">
          <SectionHead id="more-news" title="More news" action={{ href: '/news', label: 'Latest news' }} />
          <NewsGrid articles={related} />
        </section>
      )}
    </div>
  );
}
