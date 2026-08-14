'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import ThemeToggle from './ThemeToggle';
import styles from './Navbar.module.scss';

const NAV_LINKS = [
  { href: '/', label: 'Matches' },
  { href: '/series', label: 'Series' },
  { href: '/fixtures', label: 'Fixtures' },
  { href: '/rankings', label: 'Rankings' },
];

export default function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <header className={styles.navbar}>
      <div className={styles.inner}>
        <Link href="/" className={styles.logo} onClick={() => setOpen(false)}>
          <span className={styles.logoMark} aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </span>
          <span className={styles.logoText}>
            Pulse<span className={styles.logoAccent}>Crease</span>
          </span>
        </Link>

        <nav className={`${styles.links} ${open ? styles.open : ''}`}>
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`${styles.link} ${isActive(link.href) ? styles.active : ''}`}
              onClick={() => setOpen(false)}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Search lives on its own page (linked from the footer) rather than in
            the bar — the bar carries navigation and the theme switch only. */}
        <div className={styles.actions}>
          <ThemeToggle />
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
