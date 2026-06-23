import type {
  ApiResponse,
  Match,
  Series,
  Player,
  NewsArticle,
  CommentaryBall,
  RankingEntry,
  Team,
} from '@crex/shared';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000';

interface FetchOpts {
  // Next.js fetch caching controls. Default to a short revalidate for freshness.
  revalidate?: number;
  cache?: RequestCache;
}

/**
 * Low-level typed fetch against the backend. Unwraps the { success, data }
 * envelope and throws on network/HTTP/API errors so callers (or error.tsx /
 * notFound) can handle them.
 */
export async function apiGet<T>(path: string, opts: FetchOpts = {}): Promise<T> {
  const url = `${API_URL}${path.startsWith('/') ? '' : '/'}${path}`;

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    next: opts.revalidate !== undefined ? { revalidate: opts.revalidate } : undefined,
    cache: opts.cache,
  });

  if (!res.ok) {
    // Surface 404s distinctly so pages can call notFound().
    throw Object.assign(new Error(`API ${path} failed: ${res.status}`), { status: res.status });
  }

  const body = (await res.json()) as ApiResponse<T>;
  if (!body.success) throw new Error(body.error ?? 'Unknown API error');
  return body.data as T;
}

function qs(params?: Record<string, string | number | undefined>): string {
  if (!params) return '';
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
  if (!entries.length) return '';
  return '?' + entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
}

// ---------------------------------------------------------------------------
// Named helpers — one per resource
// ---------------------------------------------------------------------------

export const getMatches = (params?: { status?: string; format?: string }) =>
  apiGet<Match[]>(`/api/matches${qs(params)}`, { revalidate: 30 });

export const getMatch = (id: string) =>
  apiGet<Match>(`/api/matches/${id}`, { revalidate: 10 });

export const getCommentary = (id: string) =>
  apiGet<CommentaryBall[]>(`/api/matches/${id}/commentary`, { revalidate: 10 });

export const getSeries = () => apiGet<Series[]>('/api/series', { revalidate: 60 });

export const getSeriesDetail = (id: string) =>
  apiGet<Series & { matches: Match[] }>(`/api/series/${id}`, { revalidate: 60 });

export const getPlayer = (id: string) =>
  apiGet<Player>(`/api/players/${id}`, { revalidate: 60 });

export const getFixtures = (params?: { format?: string; date?: string; team?: string }) =>
  apiGet<Match[]>(`/api/fixtures${qs(params)}`, { revalidate: 60 });

export const getRankings = (type: string, gender?: string) =>
  apiGet<RankingEntry[]>(`/api/rankings/${type}${qs({ gender })}`, { revalidate: 300 });

export const getArticle = (slug: string) =>
  apiGet<NewsArticle>(`/api/news/${slug}`, { revalidate: 60 });

// News list returns the full paginated envelope (data + page metadata).
export interface NewsPage {
  data: NewsArticle[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export async function getNews(params?: { page?: number; limit?: number }): Promise<NewsPage> {
  const url = `${API_URL}/api/news${qs(params)}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    next: { revalidate: 60 },
  });
  if (!res.ok) throw new Error(`API /api/news failed: ${res.status}`);
  const body = (await res.json()) as ApiResponse<NewsArticle[]> & Omit<NewsPage, 'data'>;
  if (!body.success) throw new Error(body.error ?? 'Failed to load news');
  return {
    data: body.data ?? [],
    page: body.page ?? 1,
    limit: body.limit ?? 10,
    total: body.total ?? 0,
    totalPages: body.totalPages ?? 1,
  };
}

export interface SearchResults {
  players: Player[];
  teams: Team[];
  series: Series[];
  news: NewsArticle[];
}

export const searchQuery = (q: string) =>
  apiGet<SearchResults>(`/api/search${qs({ q })}`, { cache: 'no-store' });
