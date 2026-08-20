import Link from 'next/link';
import styles from './Footer.module.scss';

// Two balanced columns rather than one long stack and a single orphan link —
// the split mirrors how the navbar separates live scoring from browsing.
const COLUMNS = [
  {
    title: 'Scores',
    links: [
      { href: '/', label: 'Live Matches' },
      { href: '/fixtures', label: 'Fixtures' },
    ],
  },
  {
    title: 'Explore',
    links: [
      { href: '/series', label: 'Series' },
      { href: '/rankings', label: 'Rankings' },
      { href: '/search', label: 'Search' },
    ],
  },
];

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brand}>
          <Link href="/" className={styles.logo}>
            <span className={styles.logoMark} aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
            </span>
            <span className={styles.logoText}>
              Pulse<span className={styles.logoAccent}>Crease</span>
            </span>
          </Link>

          <p className={styles.tagline}>
            Live scores, ball-by-ball commentary and stats for every match.
          </p>

          <span className={styles.status}>
            <span className={styles.dot} aria-hidden="true" />
            Scores refresh automatically
          </span>
        </div>

        <nav className={styles.columns} aria-label="Footer">
          {COLUMNS.map((col) => (
            <div key={col.title} className={styles.column}>
              <h4>{col.title}</h4>
              {col.links.map((l) => (
                <Link key={l.href} href={l.href}>
                  {l.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </div>

      <div className={styles.bottom}>
        <div className={styles.bottomInner}>
          <span>© {new Date().getFullYear()} PulseCrease</span>
        </div>
      </div>
    </footer>
  );
}
