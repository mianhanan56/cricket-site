// Raw news payloads; decoded in lib/news.ts.
import { apiGet, type FetchOpts } from './client';

export interface ApiNewsTag {
  f_key?: string;
  tag_name?: string;
  /** t team, s series, p player. */
  tag_type?: string;
}

export interface ApiNewsArticle {
  _id?: string;
  id?: string;
  header?: string;
  excerpt?: string;
  cover_image_url?: string;
  /** Path on the upstream. */
  newsUrl?: string;
  /** Epoch ms, as a string. On the tagged list this is the only timestamp. */
  closed_on?: string;
  assigned_to_name?: string;
  tags_array?: ApiNewsTag[];
  metaData?: { subCategory?: string };
  cover_image_caption?: string;
}

export interface ApiNewsArticleBody {
  articleData?: ApiNewsArticle;
  more_news?: ApiNewsArticle[];
  moreFromAuthor?: ApiNewsArticle[];
}

export interface ApiNewsTopics {
  next?: boolean;
  topics?: Array<{ published_on?: string; articles?: ApiNewsArticle[] }>;
}

export interface ApiTaggedNews {
  next?: boolean;
  articles?: ApiNewsArticle[];
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
