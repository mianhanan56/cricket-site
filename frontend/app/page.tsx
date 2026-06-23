import type { Match, NewsArticle } from '@crex/shared';
import { getMatches, getNews } from '../lib/api';
import MatchCard from '../components/home/MatchCard';
import LiveMatchBanner from '../components/home/LiveMatchBanner';
import NewsCard from '../components/home/NewsCard';
import styles from './page.module.scss';

// Server Component — fetches on the server and streams HTML.
export default async function HomePage() {
  let matches: Match[] = [];
  let news: NewsArticle[] = [];
  let failed = false;

  try {
    [matches, news] = await Promise.all([
      getMatches(),
      getNews({ limit: 3 }).then((r) => r.data),
    ]);
  } catch {
    failed = true;
  }

  const live = matches.filter((m) => m.status === 'LIVE');
  const upcoming = matches.filter((m) => m.status === 'UPCOMING');
  const featured = live[0];

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <h1 className={styles.title}>
          Cricket, <span>live</span>.
        </h1>
        <p className={styles.subtitle}>
          Ball-by-ball scores, fixtures and the latest news — all in one place.
        </p>
      </section>

      {failed && (
        <div className={styles.notice}>
          Could not reach the API at <code>{process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000'}</code>.
          Start the backend with <code>npm run dev:backend</code>.
        </div>
      )}

      {featured && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Live Now</h2>
          <LiveMatchBanner match={featured} />
        </section>
      )}

      <Section title="Matches" empty="No live or upcoming matches.">
        {[...live, ...upcoming].map((m) => (
          <MatchCard key={m.id} match={m} />
        ))}
      </Section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Latest News</h2>
          <a href="/news" className={styles.seeAll}>
            See all →
          </a>
        </div>
        {news.length ? (
          <div className={styles.newsGrid}>
            {news.map((a) => (
              <NewsCard key={a.id} article={a} />
            ))}
          </div>
        ) : (
          <p className={styles.emptyState}>No news yet.</p>
        )}
      </section>
    </div>
  );
}

function Section({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  const items = Array.isArray(children) ? children : [children];
  const hasContent = items.some(Boolean);

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {hasContent ? (
        <div className={styles.grid}>{children}</div>
      ) : (
        <p className={styles.emptyState}>{empty}</p>
      )}
    </section>
  );
}
