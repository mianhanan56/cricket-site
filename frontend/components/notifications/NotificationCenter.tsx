'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  clearNotifications,
  markAllRead,
  markRead,
  requestSystemPermission,
  systemPermission,
  unreadCount,
  useNotifications,
  type NotificationKind,
  type PulseNotification,
  type SystemPermission,
} from '@/lib/notifications';
import { useAutomations } from '@/lib/automations';
import { closeOverlay, useOverlay } from '@/lib/uiState';
import Icon from '../ui/Icon';
import EmptyState from '../ui/EmptyState';
import { timeAgo } from '@/lib/relativeTime';
import styles from './NotificationCenter.module.scss';

export const KIND_LABEL: Record<NotificationKind, string> = {
  live: 'Live',
  moment: 'Moment',
  alert: 'Alert',
  result: 'Result',
};

export default function NotificationCenter() {
  const open = useOverlay() === 'notifications';
  return open ? <Panel /> : null;
}

function Panel() {
  const router = useRouter();
  const items = useNotifications();
  const automations = useAutomations();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [permission, setPermission] = useState<SystemPermission>('unsupported');
  const panelRef = useRef<HTMLDivElement>(null);
  const unread = unreadCount(items);

  useEffect(() => {
    setPermission(systemPermission());
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeOverlay();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const shown = filter === 'unread' ? items.filter((n) => !n.read) : items;
  const wantsSystem = automations.some((a) => a.enabled && a.action.system);

  const open = (n: PulseNotification) => {
    markRead(n.id);
    closeOverlay();
    if (n.href) router.push(n.href);
  };

  return (
    <div className={styles.root}>
      <button type="button" className={styles.scrim} aria-label="Close notifications" onClick={closeOverlay} tabIndex={-1} />
      <section
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-label="Notifications"
        tabIndex={-1}
      >
        <header className={styles.head}>
          <div className={styles.titleRow}>
            <h2 className={styles.title}>Notifications</h2>
            {unread > 0 && <span className={styles.unread}>{unread} new</span>}
            <button type="button" className={styles.close} onClick={closeOverlay} aria-label="Close">
              <Icon name="close" size={18} />
            </button>
          </div>
          <div className={styles.toolbar}>
            <div className={styles.segment} role="group" aria-label="Filter notifications">
              {(['all', 'unread'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={filter === f}
                  className={`${styles.segBtn} ${filter === f ? styles.segOn : ''}`}
                  onClick={() => setFilter(f)}
                >
                  {f === 'all' ? 'All' : 'Unread'}
                </button>
              ))}
            </div>
            <button type="button" className={styles.textBtn} onClick={markAllRead} disabled={!unread}>
              <Icon name="check" size={15} />
              Mark all read
            </button>
          </div>
        </header>

        {wantsSystem && permission === 'default' && (
          <div className={styles.permission}>
            <Icon name="bell" size={18} />
            <p>Get your alerts as browser notifications, even when this tab is in the background.</p>
            <button
              type="button"
              className={styles.permBtn}
              onClick={async () => setPermission(await requestSystemPermission())}
            >
              Enable
            </button>
          </div>
        )}

        <div className={styles.list}>
          {shown.length ? (
            <ul>
              {shown.map((n) => (
                <li key={n.id}>
                  <button type="button" className={`${styles.item} ${n.read ? '' : styles.itemUnread}`} onClick={() => open(n)}>
                    <span className={`${styles.kind} ${styles[n.kind]}`} aria-hidden="true" />
                    <span className={styles.itemBody}>
                      <span className={styles.itemMeta}>
                        <span className={`${styles.kindWord} ${styles[`${n.kind}Text`]}`}>{KIND_LABEL[n.kind]}</span>
                        <time className={styles.time} dateTime={new Date(n.at).toISOString()}>
                          {timeAgo(n.at)}
                        </time>
                      </span>
                      <span className={styles.itemTitle}>{n.title}</span>
                      {n.body && <span className={styles.itemText}>{n.body}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className={styles.emptyWrap}>
              <EmptyState
                compact
                icon="bell"
                title={filter === 'unread' ? 'You’re all caught up' : 'No notifications yet'}
                body={
                  automations.length
                    ? 'Your alerts land here as matches unfold.'
                    : 'Create an alert and PulseCrease will tell you when a wicket falls, a match starts or a chase gets close.'
                }
                action={automations.length ? undefined : { label: 'Create an alert', href: '/automations' }}
              />
            </div>
          )}
        </div>

        <footer className={styles.foot}>
          <Link href="/automations" className={styles.footLink} onClick={closeOverlay}>
            <Icon name="bolt" size={16} />
            Alerts
            {automations.length > 0 && <span className={styles.footCount}>{automations.filter((a) => a.enabled).length} active</span>}
          </Link>
          {items.length > 0 && (
            <button type="button" className={styles.textBtn} onClick={clearNotifications}>
              Clear all
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
