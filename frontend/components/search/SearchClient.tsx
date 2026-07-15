'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { searchQuery, type SearchResults } from '../../lib/api';
import styles from '../../app/search/search.module.scss';

const EMPTY: SearchResults = { players: [], teams: [], series: [] };

export default function SearchClient() {
  const params = useSearchParams();
  const initial = params.get('q') ?? '';
  const [q, setQ] = useState(initial);
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults(EMPTY);
      setSearched(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        setResults(await searchQuery(q.trim()));
      } catch {
        setResults(EMPTY);
      } finally {
        setLoading(false);
        setSearched(true);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const total =
    results.players.length + results.teams.length + results.series.length;

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Search</h1>
      <input
        className={styles.input}
        type="search"
        autoFocus
        placeholder="Search players, teams, series…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {loading && <p className={styles.hint}>Searching…</p>}
      {!loading && searched && total === 0 && (
        <p className={styles.hint}>No results for “{q}”.</p>
      )}

      {results.players.length > 0 && (
        <Section title="Players">
          {results.players.map((p) => (
            <Link key={p.id} href={`/player/${p.id}`} className={styles.item}>
              <span>{p.name}</span>
              <span className={styles.sub}>{p.country}</span>
            </Link>
          ))}
        </Section>
      )}

      {results.teams.length > 0 && (
        <Section title="Teams">
          {results.teams.map((t) => (
            <Link key={t.id} href="/" className={styles.item}>
              <span>{t.name}</span>
              <span className={styles.sub}>{t.country}</span>
            </Link>
          ))}
        </Section>
      )}

      {results.series.length > 0 && (
        <Section title="Series">
          {results.series.map((s) => (
            <span key={s.id} className={styles.item}>
              <span>{s.name}</span>
              <span className={styles.sub}>{s.format}</span>
            </span>
          ))}
        </Section>
      )}

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
