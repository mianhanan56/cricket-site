import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Match, MatchStatus } from '@/types';
import { getCrexMatchList, seriesFromMatches } from '../../../lib/crex';
import MatchCard from '../../../components/home/MatchCard';
import styles from './seriesDetail.module.scss';

// Ids here are crex series keys ("1JK", "8A") — the same ones SeriesCard links
// with. There is no series endpoint on the Worker, so a series is the slice of
// the match list that shares a series key.
//
// Freshness is set per-fetch rather than with a page-level `revalidate`: making
// the route ISR-cached would also cache the notFound() path, turning an unknown
// id into a soft 404 (the not-found page served with a 200). Same reasoning as
// /matches/[id].
const REVALIDATE = 60;

/** The matches in one series, plus the rollup that describes them. */
async function loadSeries(id: string) {
  const all = await getCrexMatchList({ revalidate: REVALIDATE }).catch(() => [] as Match[]);
  const matches = all.filter((m) => m.series.id === id);
  return { matches, summary: seriesFromMatches(matches)[0] ?? null };
}

export async function generateMetadata({ params }: { params: { id: string } }) {
  const { summary } = await loadSeries(params.id);
  if (!summary) return { title: 'Series' };

  return {
    title: `${summary.name} — Schedule & Results`,
    description: `${summary.matchCount} ${summary.format} ${
      summary.matchCount === 1 ? 'match' : 'matches'
    } in ${summary.name}. Live scores, fixtures and results.`,
  };
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// One section per state, in the order a reader works through a competition:
// what is on now, what is next, what has already happened.
const SECTIONS: ReadonlyArray<{ status: MatchStatus; title: string }> = [
  { status: 'LIVE', title: 'In progress' },
  { status: 'UPCOMING', title: 'Upcoming' },
  { status: 'COMPLETED', title: 'Results' },
];

export default async function SeriesDetailPage({ params }: { params: { id: string } }) {
  const { matches, summary } = await loadSeries(params.id);

  // crex's feed is a window on the calendar, not an archive, so a series that
  // has fully aged out is genuinely gone rather than empty.
  if (!summary) notFound();

  const start = fmtDate(summary.startDate);
  const end = fmtDate(summary.endDate);

  return (
    <div className={styles.page}>
      <Link href="/series" className={styles.back}>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M19 12H5M11 18l-6-6 6-6" />
        </svg>
        All series
      </Link>

      <header className={styles.head}>
        <div className={styles.chips}>
          <span className={styles.format}>{summary.format}</span>
          <span className={`${styles.status} ${styles[summary.status.toLowerCase()]}`}>
            {summary.status === 'LIVE' && <span className={styles.dot} aria-hidden="true" />}
            {summary.status}
          </span>
        </div>

        <h1 className={styles.heading}>{summary.name}</h1>

        <p className={styles.meta}>
          {start === end ? start : `${start} → ${end}`}
          <span className={styles.sep} aria-hidden="true">
            ·
          </span>
          {summary.matchCount} {summary.matchCount === 1 ? 'match' : 'matches'} listed
        </p>
      </header>

      {SECTIONS.map(({ status, title }) => {
        const list = matches
          .filter((m) => m.status === status)
          .sort((a, b) =>
            status === 'UPCOMING'
              ? +new Date(a.startTime) - +new Date(b.startTime)
              : +new Date(b.startTime) - +new Date(a.startTime)
          );
        if (!list.length) return null;

        return (
          <section className={styles.section} key={status}>
            <h2 className={styles.sectionTitle}>
              {title}
              <span className={styles.sectionCount}>{list.length}</span>
            </h2>
            <div className={styles.grid}>
              {list.map((m) => (
                <MatchCard match={m} key={m.id} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
