'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { Match } from '@/types';
import { matchLabel, matchSublabel, searchMatches } from '../../lib/search';
import { SearchResultsSkeleton } from './SearchSkeleton';
import styles from '../../app/search/search.module.scss';

// Results are matches, grouped by status. Teams, series and venues are all
// searchable, but what a query resolves to is the matches behind them — see
// lib/search.ts for why there is no separate Teams or Players group.
const GROUPS: { status: Match['status']; title: string }[] = [
  { status: 'LIVE', title: 'Live' },
  { status: 'UPCOMING', title: 'Upcoming' },
  { status: 'COMPLETED', title: 'Results' },
];

export default function SearchClient() {
  const params = useSearchParams();
  const initial = params.get('q') ?? '';
  const [q, setQ] = useState(initial);
  const [results, setResults] = useState<Match[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        setResults(await searchMatches(q.trim()));
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
        setSearched(true);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Search</h1>
      <input
        className={styles.input}
        type="search"
        autoFocus
        placeholder="Search teams, series, venues…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {/* Placeholder rows rather than a "Searching…" line: results land in the
          boxes already on screen instead of pushing the page down. */}
      {loading && (
        <div role="status" aria-busy="true" aria-label={`Searching for ${q.trim()}`}>
          <SearchResultsSkeleton rows={4} />
        </div>
      )}
      {!loading && searched && results.length === 0 && (
        <p className={styles.hint}>No results for “{q}”.</p>
      )}

      {/* Every group is gated on !loading so the placeholder replaces the
          previous query's results instead of stacking on top of them. */}
      {!loading &&
        GROUPS.map(({ status, title }) => {
          const rows = results.filter((m) => m.status === status);
          if (!rows.length) return null;

          return (
            <Section key={status} title={title}>
              {rows.map((m) => (
                <Link key={m.id} href={`/matches/${m.id}`} className={styles.item}>
                  <span>{matchLabel(m)}</span>
                  <span className={styles.sub}>{matchSublabel(m)}</span>
                </Link>
              ))}
            </Section>
          );
        })}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <div className={styles.list}>{children}</div>
    </section>
  );
}
