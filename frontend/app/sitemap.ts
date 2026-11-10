import type { MetadataRoute } from 'next';
import type { Match } from '@/types';
import { getApiFixtureRange, getApiMatchList, parseScheduledMatchId } from '../lib/api';
import { getRankings } from '../lib/rankings';
import { rankedDirectory } from '../lib/directory';
import { allRankingsQueries, rankingsPath } from '../lib/rankingsPages';
import { SITE_URL as SITE } from '../lib/site';

// Rebuilt hourly: the match and series URL space turns over every few days.
export const revalidate = 3600;

const STAT_SLUGS = ['most-runs', 'most-wickets'];

type Entry = MetadataRoute.Sitemap[number];

const entry = (path: string, priority: number, extra: Partial<Entry> = {}): Entry => ({
  url: `${SITE}${path}`,
  priority,
  ...extra,
});

/** First entry per URL wins, so list the most informative source first. */
function dedupe(entries: Entry[]): Entry[] {
  const seen = new Set<string>();
  return entries.filter((e) => !seen.has(e.url) && seen.add(e.url));
}

function matchEntries(matches: Match[]): Entry[] {
  const now = Date.now();
  const out: Entry[] = [];
  const series = new Map<string, { played: boolean; last: number }>();

  for (const m of matches) {
    const start = +new Date(m.startTime);
    // Only real match keys: a fixture without one is a preview URL that later redirects.
    if (!parseScheduledMatchId(m.id)) {
      out.push(
        entry(`/matches/${m.id}`, m.status === 'LIVE' ? 0.9 : 0.6, {
          changeFrequency: m.status === 'COMPLETED' ? 'monthly' : m.status === 'LIVE' ? 'always' : 'daily',
          ...(m.status === 'COMPLETED' && start <= now ? { lastModified: new Date(start) } : {}),
        })
      );
    }
    if (m.series.id) {
      const s = series.get(m.series.id) ?? { played: false, last: 0 };
      s.played ||= m.status === 'COMPLETED';
      s.last = Math.max(s.last, Math.min(start, now));
      series.set(m.series.id, s);
    }
  }

  for (const [id, s] of series) {
    out.push(entry(`/series/${id}`, 0.6, { changeFrequency: 'daily', lastModified: new Date(s.last) }));
    if (s.played) for (const slug of STAT_SLUGS) out.push(entry(`/series/${id}/stats/${slug}`, 0.4));
  }

  for (const m of matches) {
    out.push(entry(`/teams/${m.homeTeam.id}`, 0.5), entry(`/teams/${m.awayTeam.id}`, 0.5));
    if (m.venueId) out.push(entry(`/venues/${m.venueId}`, 0.4));
  }
  return out;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: Entry[] = [
    entry('', 1, { changeFrequency: 'always' }),
    ...['/fixtures', '/series', '/teams', '/players', '/news'].map((p) => entry(p, 0.8, { changeFrequency: 'daily' })),
    ...allRankingsQueries().map((q) => entry(rankingsPath(q), 0.7, { changeFrequency: 'weekly' })),
    ...['/about', '/privacy'].map((p) => entry(p, 0.3, { changeFrequency: 'yearly' })),
  ];

  // Each source is optional: a failed read drops its URLs, never the whole sitemap.
  // News stories are noindex (headline and summary only), so they stay out.
  const [live, corpus, rankings] = await Promise.all([
    getApiMatchList({ revalidate: 3600 }).catch(() => [] as Match[]),
    getApiFixtureRange().catch(() => [] as Match[]),
    getRankings().catch(() => null),
  ]);

  const directory = rankings ? rankedDirectory(rankings) : { players: [], teams: [] };

  return dedupe([
    ...staticRoutes,
    ...matchEntries([...live, ...corpus]),
    ...directory.teams.map((t) => entry(`/teams/${t.id}`, 0.6, { changeFrequency: 'weekly' })),
    ...directory.players.map((p) => entry(`/players/${p.id}`, 0.5, { changeFrequency: 'weekly' })),
  ]);
}
