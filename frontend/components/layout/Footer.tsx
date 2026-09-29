import Link from 'next/link';
import Logo from '../brand/Logo';
import styles from './Footer.module.scss';

// `docked` links are already in the phone dock or header, so the footer drops them there.
const COLUMNS: Array<{ title: string; links: Array<{ href: string; label: string; docked?: boolean }> }> = [
  {
    title: 'Live',
    links: [
      { href: '/', label: 'Matches', docked: true },
      { href: '/fixtures', label: 'Fixtures', docked: true },
      { href: '/insights', label: 'Insights' },
    ],
  },
  {
    title: 'Explore',
    links: [
      { href: '/series', label: 'Series', docked: true },
      { href: '/rankings', label: 'Rankings', docked: true },
      { href: '/teams', label: 'Teams' },
      { href: '/players', label: 'Players' },
    ],
  },
  {
    title: 'Yours',
    links: [
      { href: '/my', label: 'My Cricket' },
      { href: '/automations', label: 'Alerts' },
      { href: '/search', label: 'Search', docked: true },
    ],
  },
];

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brand}>
          <Link href="/" className={styles.logo} aria-label="PulseCrease home">
            <Logo />
          </Link>
          <p className={styles.tagline}>Every ball. Live.</p>
        </div>

        <nav className={styles.columns} aria-label="Footer">
          {COLUMNS.map((col) => (
            <div key={col.title} className={styles.column}>
              <h2 className={styles.colTitle}>{col.title}</h2>
              {col.links.map((l) => (
                <Link key={l.href} href={l.href} className={`${styles.link} ${l.docked ? styles.docked : ''}`}>
                  {l.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </div>

      <div className={styles.crease} aria-hidden="true" />
      <div className={styles.bottom}>
        <span>© {new Date().getFullYear()} PulseCrease</span>
        <span className={styles.shortcut}>
          Press <kbd>/</kbd> to search
        </span>
      </div>
    </footer>
  );
}
