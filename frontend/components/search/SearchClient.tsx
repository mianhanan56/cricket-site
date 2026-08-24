'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
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
  const router = useRouter();
  const params = useSearchParams();
  const urlQuery = params.get('q') ?? '';

  const [q, setQ] = useState(urlQuery);
  const [results, setResults] = useState<Match[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // `?q=` used to be read once into state and never looked at again, which made
  // the URL a dead seed: results were not shareable, Back and Forward did
  // nothing, and following a navbar search while already on /search left the
  // previous query in the box. Adopting it whenever it changes underneath makes
  // history work — and typing writes it back below, so the two stay in step.
  //
  // Typing is NOT routed per keystroke, though. The box keeps its own state so
  // input never waits on a navigation; the URL catches up on the same debounce
  // as the search itself.
  useEffect(() => setQ(urlQuery), [urlQuery]);

  useEffect(() => {
    const term = q.trim();

    if (term.length < 2) {
      setResults([]);
      setSearched(false);
      // A cleared box clears the URL too, so a shared link never carries a
      // query the page is no longer showing.
      if (!term && urlQuery) router.replace('/search', { scroll: false });
      return;
    }
    setLoading(true);

    // Guards an out-of-order landing. Clearing the debounce timer does nothing
    // to a request already in flight, so a slow "ind" could resolve after a
    // fast "india" and overwrite the newer results with the older ones. The
    // flag is flipped by this effect's own cleanup, so only the newest query
    // is ever allowed to write.
    let current = true;

    const t = setTimeout(async () => {
      // `replace`, not `push`: Back should leave the search page, not walk
      // letter by letter through everything typed to get here.
      if (term !== urlQuery) {
        router.replace(`/search?q=${encodeURIComponent(term)}`, { scroll: false });
      }

      let found: Match[] = [];
      try {
        found = await searchMatches(term);
      } catch {
        found = [];
      }
      if (!current) return;
      setResults(found);
      setLoading(false);
      setSearched(true);
    }, 300);

    return () => {
      current = false;
      clearTimeout(t);
    };
  }, [q, urlQuery, router]);

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
