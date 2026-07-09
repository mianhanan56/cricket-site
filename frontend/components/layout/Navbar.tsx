'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import SearchBar from './SearchBar';
import styles from './Navbar.module.scss';

// Nav routes temporarily hidden until their pages are ready. Uncomment to
// restore the Home / Matches / Fixtures / Rankings / News links.
// const NAV_LINKS = [
//   { href: '/', label: 'Home' },
//   { href: '/matches', label: 'Matches' },
//   { href: '/fixtures', label: 'Fixtures' },
//   { href: '/rankings', label: 'Rankings' },
//   { href: '/news', label: 'News' },
// ];

export default function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <header className={styles.navbar}>
      <div className={styles.inner}>
        <Link href="/" className={styles.logo} onClick={() => setOpen(false)}>
          <span className={styles.logoMark}>C</span>
          <span className={styles.logoText}>PulseCrease</span>
        </Link>

        <nav className={`${styles.links} ${open ? styles.open : ''}`}>
          {/* {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`${styles.link} ${isActive(link.href) ? styles.active : ''}`}
              onClick={() => setOpen(false)}
            >
              {link.label}
            </Link>
          ))} */}
        </nav>

        <div className={styles.actions}>
          <SearchBar />
          <button
            className={styles.burger}
            aria-label="Toggle menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </div>
    </header>
  );
}
