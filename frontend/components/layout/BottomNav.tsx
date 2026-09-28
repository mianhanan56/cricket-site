'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import Icon from '../ui/Icon';
import ThemeToggle from './ThemeToggle';
import { PRIMARY_NAV, isActive, type NavLink } from './nav';
import { closeOverlay, openOverlay, toggleOverlay, useOverlay } from '@/lib/uiState';
import styles from './BottomNav.module.scss';

// Search sits between these two as a button — it opens the overlay, not a page.
const DOCK_START: NavLink[] = [PRIMARY_NAV[0]];
const DOCK_END: NavLink[] = [
  { href: '/my', label: 'My Cricket', icon: 'star' },
  { href: '/automations', label: 'Alerts', icon: 'bolt' },
];
const DOCK = [...DOCK_START, ...DOCK_END];

const MORE: NavLink[] = [
  ...PRIMARY_NAV.slice(1),
  { href: '/players', label: 'Players', icon: 'player' },
  { href: '/fixtures', label: 'Fixtures', icon: 'calendar' },
];

function DockLink({ link, active }: { link: NavLink; active: boolean }) {
  return (
    <Link href={link.href} className={`${styles.item} ${active ? styles.active : ''}`} aria-current={active ? 'page' : undefined}>
      <Icon name={link.icon} size={21} strokeWidth={active ? 2.1 : 1.7} />
      <span>{link.label}</span>
    </Link>
  );
}

export default function BottomNav() {
  const pathname = usePathname();
  const overlay = useOverlay();
  const menuOpen = overlay === 'menu';

  useEffect(() => {
    closeOverlay();
  }, [pathname]);

  const moreActive = MORE.some((l) => isActive(pathname, l)) && !DOCK.some((l) => isActive(pathname, l));

  return (
    <>
      {menuOpen && (
        <div className={styles.sheetWrap}>
          <button type="button" className={styles.scrim} aria-label="Close menu" onClick={closeOverlay} />
          <nav className={styles.sheet} aria-label="More">
            <span className={styles.grabber} aria-hidden="true" />
            <ul className={styles.sheetList}>
              {MORE.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className={`${styles.sheetLink} ${isActive(pathname, link) ? styles.sheetActive : ''}`}
                  >
                    <Icon name={link.icon} size={20} />
                    {link.label}
                  </Link>
                </li>
              ))}
              <li>
                <ThemeToggle withLabel />
              </li>
            </ul>
          </nav>
        </div>
      )}

      <nav className={styles.dock} aria-label="Primary">
        {DOCK_START.map((link) => (
          <DockLink key={link.href} link={link} active={isActive(pathname, link)} />
        ))}
        <button
          type="button"
          className={`${styles.item} ${overlay === 'search' ? styles.active : ''}`}
          onClick={() => openOverlay('search')}
          aria-label="Search"
        >
          <Icon name="search" size={21} />
          <span>Search</span>
        </button>
        {DOCK_END.map((link) => (
          <DockLink key={link.href} link={link} active={isActive(pathname, link)} />
        ))}
        <button
          type="button"
          className={`${styles.item} ${menuOpen || moreActive ? styles.active : ''}`}
          onClick={() => toggleOverlay('menu')}
          aria-expanded={menuOpen}
          aria-label="More"
        >
          <Icon name={menuOpen ? 'close' : 'menu'} size={21} />
          <span>More</span>
        </button>
      </nav>
    </>
  );
}
