import type { NewsArticle, NewsPage, NewsTag, NewsTagKind } from '@/types';
import {
  getApiNewsArticle,
  getApiNewsTopics,
  getApiTaggedNews,
  isRejectedRequest,
  type ApiNewsArticle,
  type ApiNewsTopics,
  type ApiTaggedNews,
} from './api';

export const NEWS_PAGE_SIZE = 12;
// Matches the Worker's bound on /news/topics.
export const NEWS_MAX_PAGE = 60;

const TAG_KIND: Record<string, NewsTagKind> = { t: 'team', s: 'series', p: 'player' };
const TAG_PARAM: Record<NewsTagKind, 't' | 's' | 'p'> = { team: 't', series: 's', player: 'p' };
const IMAGE_HOSTS = new Set(['onecricketnews.akamaized.net', 'storage.googleapis.com']);

/**
 * The same file is served from Google Storage as an original (~80 KB JPEG) and
 * from the upstream's CDN, which resizes to WebP on `type` (mq ~30 KB, lq ~8 KB).
 */
export function newsImage(raw: string | undefined, quality: 'mq' | 'lq'): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || !IMAGE_HOSTS.has(url.hostname)) return null;
  url.hostname = 'onecricketnews.akamaized.net';
  url.search = '';
  url.searchParams.set('type', quality);
  return url.toString();
}

/** "/cricket-prediction/…" → "Prediction". Plain news carries no label. */
export function newsCategory(path: string): string | null {
  const section = path.split('/')[1]?.replace(/^cricket-/, '') ?? '';
  if (!section || section === 'news') return null;
  const words = section.split('-').filter(Boolean);
  return words.length ? words.map((w) => w[0].toUpperCase() + w.slice(1)).join(' ') : null;
}

function isoFromEpoch(ms: string | undefined): string | null {
  const n = Number(ms);
  return Number.isFinite(n) && n > 0 ? new Date(n).toISOString() : null;
}

function decodeTags(raw: ApiNewsArticle['tags']): NewsTag[] {
  const seen = new Set<string>();
  const tags: NewsTag[] = [];
  for (const t of raw ?? []) {
    const kind = TAG_KIND[t.type ?? ''];
    const name = t.name?.trim();
    if (!kind || !t.key || !name || seen.has(`${kind}:${t.key}`)) continue;
    seen.add(`${kind}:${t.key}`);
    tags.push({ kind, id: t.key, name });
  }
  return tags;
}

// The upstream's own slug, which ends in the article id — "kusal-mendis-…-6ac4e7776151a66b14efba17".
const SLUG = /^[a-z0-9-]*?([0-9a-f]{24})$/;

export function idFromSlug(slug: string): string | null {
  return SLUG.exec(slug)?.[1] ?? null;
}

export function decodeArticle(raw: ApiNewsArticle, fallbackTime?: string): NewsArticle | null {
  const id = raw.id;
  const title = raw.title?.trim();
  const path = raw.path;
  const publishedAt = isoFromEpoch(raw.publishedTime) ?? isoFromEpoch(fallbackTime);
  if (!id || !title || !path?.startsWith('/') || !publishedAt) return null;
  const tail = path.split('/').pop() ?? '';

  return {
    id,
    slug: idFromSlug(tail) === id ? tail : id,
    title,
    excerpt: raw.excerpt?.trim() || null,
    image: newsImage(raw.imageUrl, 'mq'),
    imageCaption: raw.imageCaption?.trim() || null,
    publishedAt,
    author: raw.author?.trim() || null,
    category: newsCategory(path),
    tags: decodeTags(raw.tags),
  };
}

function uniqueNewestFirst(articles: Array<NewsArticle | null>): NewsArticle[] {
  const byId = new Map<string, NewsArticle>();
  for (const a of articles) if (a && !byId.has(a.id)) byId.set(a.id, a);
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

export function newsFromTopics(raw: ApiNewsTopics, page: number): NewsPage {
  const articles = (raw.topics ?? []).flatMap((t) => (t.articles ?? []).map((a) => decodeArticle(a, t.publishedTime)));
  return { articles: uniqueNewestFirst(articles), page, hasNext: !!raw.hasNext && page < NEWS_MAX_PAGE };
}

export function newsFromTagged(raw: ApiTaggedNews): NewsArticle[] {
  return uniqueNewestFirst((raw.articles ?? []).map((a) => decodeArticle(a)));
}

export async function getLatestNews(page: number): Promise<NewsPage> {
  return newsFromTopics(await getApiNewsTopics(page, NEWS_PAGE_SIZE), page);
}

/** Never throws: news is a side section, and a failure should leave the page whole. */
export async function getTaggedNews(kind: NewsTagKind, id: string): Promise<NewsArticle[]> {
  try {
    return newsFromTagged(await getApiTaggedNews(TAG_PARAM[kind], id));
  } catch {
    return [];
  }
}

export interface NewsStory {
  article: NewsArticle;
  related: NewsArticle[];
}

const RELATED_SHOWN = 6;
// Pages of the latest list searched when the article route can't answer (a Worker without it).
const FALLBACK_PAGES = 3;

async function storyFromLatest(id: string): Promise<NewsStory | null> {
  const pages = await Promise.all(
    Array.from({ length: FALLBACK_PAGES }, (_, i) => getLatestNews(i + 1).catch(() => null))
  );
  const all = uniqueNewestFirst(pages.flatMap((p) => p?.articles ?? []));
  const article = all.find((a) => a.id === id);
  return article ? { article, related: all.filter((a) => a.id !== id).slice(0, RELATED_SHOWN) } : null;
}

/** null when the slug names no article; an outage throws. */
export async function getNewsStory(slug: string): Promise<NewsStory | null> {
  const id = idFromSlug(slug);
  if (!id) return null;
  try {
    const body = await getApiNewsArticle(id);
    const article = body.article ? decodeArticle(body.article) : null;
    if (article) {
      const related = uniqueNewestFirst(
        [...(body.moreNews ?? []), ...(body.moreFromAuthor ?? [])].map((a) => decodeArticle(a))
      ).filter((a) => a.id !== id);
      return { article, related: related.slice(0, RELATED_SHOWN) };
    }
    return storyFromLatest(id);
  } catch (err) {
    const found = await storyFromLatest(id);
    if (found || isRejectedRequest(err)) return found;
    throw err;
  }
}

export function newsTagHref(tag: NewsTag): string {
  const base = tag.kind === 'team' ? '/teams' : tag.kind === 'series' ? '/series' : '/players';
  return `${base}/${encodeURIComponent(tag.id)}`;
}
