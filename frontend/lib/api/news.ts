// Raw news payloads; decoded in lib/news.ts.
import { apiGet, type FetchOpts } from './client';

export interface ApiNewsTag {
  key?: string;
  name?: string;
  /** t team, s series, p player. */
  type?: string;
}

/** A headline card: the tagged list and an article's related stories. */
export interface ApiNewsCard {
  id?: string;
  title?: string;
  imageUrl?: string;
  /** Path on the upstream. */
  path?: string;
  /** Epoch ms, as a string. On the tagged list this is the only timestamp. */
  publishedTime?: string;
  author?: string;
  tags?: ApiNewsTag[];
}

/** The article itself, and every item on the latest list. */
export interface ApiNewsArticle extends ApiNewsCard {
  excerpt?: string;
  imageCaption?: string;
}

export interface ApiNewsArticleBody {
  article?: ApiNewsArticle;
  moreNews?: ApiNewsCard[];
  moreFromAuthor?: ApiNewsCard[];
}

export interface ApiNewsTopics {
  hasNext?: boolean;
  topics?: Array<{ publishedTime?: string; articles?: ApiNewsArticle[] }>;
}

export interface ApiTaggedNews {
  articles?: ApiNewsCard[];
}

export function getApiNewsTopics(page: number, limit: number, opts: FetchOpts = {}): Promise<ApiNewsTopics> {
  return apiGet<ApiNewsTopics>(`/news/topics?page=${page}&limit=${limit}`, { revalidate: 900, ...opts });
}

export function getApiNewsArticle(id: string, opts: FetchOpts = {}): Promise<ApiNewsArticleBody> {
  return apiGet<ApiNewsArticleBody>(`/news/article?id=${encodeURIComponent(id)}`, { revalidate: 900, ...opts });
}

export function getApiTaggedNews(type: 't' | 's' | 'p', key: string, opts: FetchOpts = {}): Promise<ApiTaggedNews> {
  return apiGet<ApiTaggedNews>(`/news/tagged?type=${type}&key=${encodeURIComponent(key)}`, {
    revalidate: 900,
    ...opts,
  });
}
