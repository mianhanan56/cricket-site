'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import Logo from '../brand/Logo';
import Icon from '../ui/Icon';
import ThemeToggle from './ThemeToggle';
import { PRIMARY_NAV, isActive } from './nav';
import { toggleOverlay, openOverlay, useOverlay } from '@/lib/uiState';
import { unreadCount, useNotifications } from '@/lib/notifications';
import { followCount, useFollows } from '@/lib/follows';
import styles from './Navbar.module.scss';

export default function Navbar() {
  const pathname = usePathname();
  const overlay = useOverlay();
  const unread = unreadCount(useNotifications());
  const following = followCount(useFollows());
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => setProfileOpen(false), [pathname]);

  useEffect(() => {
    if (!profileOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!profileRef.current?.contains(e.target as Node)) setProfileOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setProfileOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [profileOpen]);

  return (
    <header className={styles.navbar}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand} aria-label="PulseCrease home">
          <Logo />
        </Link>

        <nav className={styles.links} aria-label="Primary">
          {PRIMARY_NAV.map((link) => {
            const active = isActive(pathname, link);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`${styles.link} ${active ? styles.active : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.search}
            onClick={() => openOverlay('search')}
            aria-label="Search"
            aria-keyshortcuts="/"
          >
            <Icon name="search" size={17} />
            <span className={styles.searchLabel}>Search</span>
            <kbd className={styles.kbd}>/</kbd>
          </button>

          <button
            type="button"
            className={`${styles.iconBtn} ${overlay === 'notifications' ? styles.iconBtnOn : ''}`}
            onClick={() => toggleOverlay('notifications')}
            aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
            aria-expanded={overlay === 'notifications'}
          >
            <Icon name="bell" size={19} />
            {unread > 0 && <span className={styles.badge}>{unread > 9 ? '9+' : unread}</span>}
          </button>

          <span className={styles.desktopOnly}>
            <ThemeToggle />
          </span>

          <div className={`${styles.profile} ${styles.desktopOnly}`} ref={profileRef}>
            <button
              type="button"
              className={`${styles.avatar} ${profileOpen ? styles.avatarOn : ''}`}
              onClick={() => setProfileOpen((v) => !v)}
              aria-label="My Cricket menu"
              aria-expanded={profileOpen}
              aria-haspopup="menu"
            >
              <Icon name="user" size={18} />
            </button>
            {profileOpen && (
              <div className={styles.menu} role="menu">
                <Link href="/my" className={styles.menuItem} role="menuitem">
                  <Icon name="star" size={17} />
                  <span>My Cricket</span>
                  {following > 0 && <span className={styles.menuCount}>{following}</span>}
                </Link>
                <Link href="/automations" className={styles.menuItem} role="menuitem">
                  <Icon name="bolt" size={17} />
                  <span>Alerts</span>
                </Link>
                <Link href="/fixtures" className={styles.menuItem} role="menuitem">
                  <Icon name="calendar" size={17} />
                  <span>Fixtures</span>
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
