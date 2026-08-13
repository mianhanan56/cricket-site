import type { MetadataRoute } from 'next';
import { getCrexMatchList } from '../lib/crex';

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = ['', '/fixtures', '/rankings', '/search'].map(
    (p) => ({ url: `${SITE}${p}`, lastModified: new Date(), changeFrequency: 'daily', priority: p === '' ? 1 : 0.7 })
  );

  let dynamic: MetadataRoute.Sitemap = [];
  try {
    const matches = await getCrexMatchList({ revalidate: 3600 });
    dynamic = matches.map((m) => ({
      url: `${SITE}/matches/${m.id}`,
      lastModified: new Date(),
      priority: 0.6,
    }));
  } catch {
    // Worker unreachable at build time — ship the static routes only.
  }

  return [...staticRoutes, ...dynamic];
}
