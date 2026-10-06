import Link from 'next/link';
import type { NewsArticle, NewsTag, NewsTagKind } from '@/types';
import { getTaggedNews, newsImage, newsTagHref } from '@/lib/news';
import Icon from '../ui/Icon';
import LocalTime from '../ui/LocalTime';
import { SectionHead } from '../ui/Section';
import styles from './NewsList.module.scss';

const TAG_ORDER: Record<NewsTag['kind'], number> = { series: 0, team: 1, player: 2 };
const TAGS_SHOWN = 4;

function Tags({ tags }: { tags: NewsTag[] }) {
  if (!tags.length) return null;
  const shown = [...tags].sort((a, b) => TAG_ORDER[a.kind] - TAG_ORDER[b.kind]).slice(0, TAGS_SHOWN);
  return (
    <ul className={styles.tags}>
      {shown.map((t) => (
        <li key={`${t.kind}-${t.id}`}>
          <Link href={newsTagHref(t)} className={styles.tag}>
            {t.name}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Headline({ article, level }: { article: NewsArticle; level: 2 | 3 }) {
  const H = level === 2 ? 'h2' : 'h3';
  return (
    <H className={styles.headline}>
      <a href={article.url} target="_blank" rel="noopener noreferrer" className={styles.cover}>
        {article.title}
        <span className={styles.srOnly}> (opens on crex.com)</span>
      </a>
    </H>
  );
}

function Meta({ article }: { article: NewsArticle }) {
  return (
    <p className={styles.meta}>
      <LocalTime iso={article.publishedAt} format="dayTime" />
      {article.author && <span className={styles.author}>{article.author}</span>}
      <Icon name="external" size={14} className={styles.out} />
    </p>
  );
}

function Thumb({ src, lead }: { src: string | null; lead?: boolean }) {
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- crex's CDN already serves resized WebP
    <img
      className={lead ? styles.leadImage : styles.thumb}
      src={lead ? src : (newsImage(src, 'lq') ?? src)}
      alt=""
      width={lead ? 640 : 160}
      height={lead ? 360 : 90}
      loading={lead ? 'eager' : 'lazy'}
      decoding="async"
    />
  );
}

export function NewsLead({ article }: { article: NewsArticle }) {
  return (
    <article className={styles.lead}>
      <Thumb src={article.image} lead />
      <div className={styles.leadBody}>
        {article.category && <span className={styles.category}>{article.category}</span>}
        <Headline article={article} level={2} />
        {article.excerpt && <p className={styles.excerpt}>{article.excerpt}</p>}
        <Meta article={article} />
        <Tags tags={article.tags} />
      </div>
    </article>
  );
}

export function NewsRow({ article, level = 3 }: { article: NewsArticle; level?: 2 | 3 }) {
  return (
    <article className={styles.row}>
      <Thumb src={article.image} />
      <div className={styles.body}>
        {article.category && <span className={styles.category}>{article.category}</span>}
        <Headline article={article} level={level} />
        <Meta article={article} />
      </div>
      <Tags tags={article.tags} />
    </article>
  );
}

export function NewsGrid({ articles, level = 3 }: { articles: NewsArticle[]; level?: 2 | 3 }) {
  return (
    <ul className={styles.grid}>
      {articles.map((a) => (
        <li key={a.id}>
          <NewsRow article={a} level={level} />
        </li>
      ))}
    </ul>
  );
}

const SECTION_SHOWN = 6;

/** News on a team, series or player page. Renders nothing when there is none. */
export function NewsSection({ articles, id, className }: { articles: NewsArticle[]; id: string; className?: string }) {
  if (!articles.length) return null;
  return (
    <section className={className} aria-labelledby={id}>
      <SectionHead id={id} title="News" action={{ href: '/news', label: 'Latest news' }} />
      <NewsGrid articles={articles.slice(0, SECTION_SHOWN)} />
    </section>
  );
}

export async function TaggedNews({ kind, id, className }: { kind: NewsTagKind; id: string; className?: string }) {
  return <NewsSection articles={await getTaggedNews(kind, id)} id={`${kind}-news`} className={className} />;
}
