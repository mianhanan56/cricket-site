'use client';

import { openOverlay } from '@/lib/uiState';
import { SectionHead } from '../ui/Section';
import Icon from '../ui/Icon';
import { useNotificationPermission } from './useNotificationPermission';
import styles from './BrowserNotifications.module.scss';

export default function BrowserNotifications() {
  const [permission, requestPermission] = useNotificationPermission();

  return (
    <section className={styles.panel} aria-labelledby="browser-notifications">
      <SectionHead title="Browser notifications" id="browser-notifications" level={3}>
        {permission === 'granted' && <span className={`${styles.badge} ${styles.badgeOn}`}>On</span>}
        {permission === 'denied' && <span className={styles.badge}>Blocked</span>}
      </SectionHead>

      <div className={styles.body} aria-live="polite">
        {permission === 'denied' ? (
          <>
            <p>Notifications are blocked for this site, so your browser won’t show them.</p>
            <p>
              To turn them back on, click the lock or site-settings icon at the left of the address bar, set
              Notifications to Allow, then reload this page.
            </p>
          </>
        ) : permission === 'unsupported' ? (
          <p>This browser doesn’t support notifications. Your alerts will still show inside PulseCrease.</p>
        ) : permission === 'granted' ? (
          <p>Notifications are allowed. Switch on “Browser notification” when you create an alert.</p>
        ) : (
          <p>Get instant alerts when important cricket events happen.</p>
        )}
        {permission === 'default' && (
          <button type="button" className={styles.enable} onClick={() => void requestPermission()}>
            <Icon name="bell" size={16} />
            Enable notifications
          </button>
        )}
      </div>

      <div className={styles.inApp}>
        <p>Every alert also lands in your notification center while PulseCrease is open in a tab.</p>
        <button type="button" className={styles.open} onClick={() => openOverlay('notifications')}>
          Open notification center
        </button>
      </div>
    </section>
  );
}
