import type { MetadataRoute } from 'next';
import { getCrexMatchList, seriesFromMatches } from '../lib/crex';

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

/** Distinct, non-empty keys, in first-seen order. */
const uniq = (keys: string[]): string[] => [...new Set(keys.filter(Boolean))];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    '',
    '/series',
    '/fixtures',
    '/rankings',
    '/search',
  ].map((p) => ({
    url: `${SITE}${p}`,
    lastModified: new Date(),
    changeFrequency: 'daily',
    priority: p === '' ? 1 : 0.7,
  }));

  let dynamic: MetadataRoute.Sitemap = [];
  try {
    const matches = await getCrexMatchList({ revalidate: 3600 });
    dynamic = [
      ...matches.map((m) => ({
        url: `${SITE}/matches/${m.id}`,
        lastModified: new Date(),
        priority: 0.6,
      })),
      // Series come off the same fetch, so listing them costs nothing extra.
      ...seriesFromMatches(matches).map((s) => ({
        url: `${SITE}/series/${s.id}`,
        lastModified: new Date(),
        priority: 0.5,
      })),
      // Teams and grounds, from the same fetch again. Deduped because the feed
      // names the same sides and the same venues across dozens of matches, and a
      // sitemap that lists a URL forty times is a sitemap with one entry and
      // thirty-nine mistakes.
      ...uniq(matches.flatMap((m) => [m.homeTeam.id, m.awayTeam.id])).map((key) => ({
        url: `${SITE}/teams/${key}`,
        lastModified: new Date(),
        priority: 0.5,
      })),
      ...uniq(matches.map((m) => m.venueId ?? '')).map((key) => ({
        url: `${SITE}/venues/${key}`,
        lastModified: new Date(),
        priority: 0.4,
      })),
    ];
  } catch {
    // Worker unreachable at build time — ship the static routes only.
  }

  return [...staticRoutes, ...dynamic];
}
