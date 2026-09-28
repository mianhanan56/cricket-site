import Link from 'next/link';
import Logo from '../brand/Logo';
import styles from './Footer.module.scss';

const COLUMNS = [
  {
    title: 'Live',
    links: [
      { href: '/', label: 'Matches' },
      { href: '/fixtures', label: 'Schedule' },
      { href: '/insights', label: 'Insights' },
    ],
  },
  {
    title: 'Explore',
    links: [
      { href: '/series', label: 'Series' },
      { href: '/rankings', label: 'Rankings' },
      { href: '/teams', label: 'Teams' },
      { href: '/players', label: 'Players' },
    ],
  },
  {
    title: 'Yours',
    links: [
      { href: '/my', label: 'My Cricket' },
      { href: '/automations', label: 'Automations' },
      { href: '/search', label: 'Search' },
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
                <Link key={l.href} href={l.href} className={styles.link}>
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
