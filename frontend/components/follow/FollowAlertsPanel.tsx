'use client';

import { useId } from 'react';
import { useFollows, type Follows } from '@/lib/follows';
import {
  FOLLOW_MOMENTS,
  setFollowAlertsOn,
  toggleFollowMoment,
  useFollowAlerts,
} from '@/lib/followAlerts';
import { useNotificationPermission } from '../automations/useNotificationPermission';
import Icon from '../ui/Icon';
import styles from './FollowAlertsPanel.module.scss';

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "2 teams and 1 series" */
function followedPhrase(f: Follows): string {
  const parts = [
    f.teams.length ? count(f.teams.length, 'team') : '',
    f.players.length ? count(f.players.length, 'player') : '',
    f.series.length ? count(f.series.length, 'series', 'series') : '',
  ].filter(Boolean);
  return parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** Following is the alert: one switch, the moments it covers, and the browser's say-so. */
export default function FollowAlertsPanel({
  browser = true,
  className,
}: {
  /** Off where the page has its own browser-permission card. */
  browser?: boolean;
  className?: string;
}) {
  const follows = useFollows();
  const prefs = useFollowAlerts();
  const [permission, requestPermission] = useNotificationPermission();
  const titleId = useId();
  const phrase = followedPhrase(follows);

  return (
    <section className={`${styles.panel} ${className ?? ''}`} aria-labelledby={titleId} data-off={!prefs.on || undefined}>
      <div className={styles.head}>
        <span className={styles.icon} aria-hidden="true">
          <Icon name="bell" size={18} />
        </span>
        <div className={styles.titles}>
          <h2 className={styles.title} id={titleId}>
            Notifications
          </h2>
          <p className={styles.sub}>{phrase ? `For the ${phrase} you follow` : 'For whatever you follow'}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={prefs.on}
          aria-label="Notifications for what you follow"
          className={styles.switch}
          onClick={() => setFollowAlertsOn(!prefs.on)}
        >
          <span className={styles.track} aria-hidden="true" />
          {prefs.on ? 'On' : 'Off'}
        </button>
      </div>

      <ul className={styles.moments} aria-label="What to be told about">
        {FOLLOW_MOMENTS.map((m) => {
          const on = !prefs.off.includes(m.key);
          return (
            <li key={m.key}>
              <button
                type="button"
                className={styles.moment}
                aria-pressed={on}
                disabled={!prefs.on}
                onClick={() => toggleFollowMoment(m.key)}
              >
                <Icon name={on ? 'check' : 'plus'} size={14} strokeWidth={2.4} />
                {m.label}
              </button>
            </li>
          );
        })}
      </ul>

      {browser && permission && permission !== 'unsupported' && (
        <div className={styles.browser} aria-live="polite">
          {permission === 'granted' ? (
            <p className={styles.browserOn}>
              <Icon name="check" size={16} strokeWidth={2.4} />
              Browser notifications on while PulseCrease is open
            </p>
          ) : permission === 'denied' ? (
            <p className={styles.browserOff}>Browser notifications are blocked. Allow them from the lock icon in the address bar.</p>
          ) : (
            <button type="button" className={styles.allow} onClick={() => void requestPermission()} disabled={!prefs.on}>
              <Icon name="bell" size={16} />
              Allow browser notifications
            </button>
          )}
        </div>
      )}
    </section>
  );
}
