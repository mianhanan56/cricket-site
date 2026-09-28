'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import Icon from '../ui/Icon';
import ThemeToggle from './ThemeToggle';
import { PRIMARY_NAV, isActive, type NavLink } from './nav';
import { closeOverlay, toggleOverlay, useOverlay } from '@/lib/uiState';
import styles from './BottomNav.module.scss';

const DOCK: NavLink[] = [
  PRIMARY_NAV[0],
  PRIMARY_NAV[1],
  PRIMARY_NAV[2],
  { href: '/my', label: 'Mine', icon: 'star', also: ['/automations'] },
];

const MORE: NavLink[] = [
  PRIMARY_NAV[3],
  PRIMARY_NAV[4],
  PRIMARY_NAV[5],
  { href: '/fixtures', label: 'Full schedule', icon: 'calendar' },
  { href: '/automations', label: 'Automations', icon: 'bolt' },
];

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
        {DOCK.map((link) => {
          const active = isActive(pathname, link);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`${styles.item} ${active ? styles.active : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              <Icon name={link.icon} size={21} strokeWidth={active ? 2.1 : 1.7} />
              <span>{link.label}</span>
            </Link>
          );
        })}
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
