import Link from 'next/link';
import styles from './Footer.module.scss';

const COLUMNS = [
  {
    title: 'Cricket',
    links: [
      { href: '/fixtures', label: 'Fixtures' },
      { href: '/series', label: 'Series' },
      { href: '/rankings', label: 'Rankings' },
    ],
  },
  {
    title: 'More',
    links: [
      { href: '/news', label: 'News' },
      { href: '/search', label: 'Search' },
    ],
  },
];

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brand}>
          <span className={styles.logo}>PulseCrease</span>
          <p className={styles.tagline}>Live cricket scores, stats &amp; news.</p>
        </div>

        <div className={styles.columns}>
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
        </div>
      </div>

      <div className={styles.bottom}>
        <span>© {new Date().getFullYear()} PulseCrease. For educational use.</span>
      </div>
    </footer>
  );
}
