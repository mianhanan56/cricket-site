'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { markRead, onToast, type PulseNotification } from '@/lib/notifications';
import Icon from '../ui/Icon';
import { KIND_LABEL } from './NotificationCenter';
import styles from './Toaster.module.scss';

const TOAST_MS = 6500;

export default function Toaster() {
  const router = useRouter();
  const [toasts, setToasts] = useState<PulseNotification[]>([]);

  useEffect(
    () =>
      onToast((t) => {
        setToasts((prev) => [t, ...prev].slice(0, 3));
        window.setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), TOAST_MS);
      }),
    []
  );

  const dismiss = (id: string) => setToasts((prev) => prev.filter((x) => x.id !== id));

  return (
    <div className={styles.stack} aria-live="polite" aria-relevant="additions">
      {toasts.map((t) => (
        <div key={t.id} className={`${styles.toast} ${styles[t.kind] ?? ''}`}>
          <button
            type="button"
            className={styles.body}
            onClick={() => {
              markRead(t.id);
              dismiss(t.id);
              if (t.href) router.push(t.href);
            }}
          >
            <span className={styles.kind}>{KIND_LABEL[t.kind]}</span>
            <span className={styles.title}>{t.title}</span>
            {t.body && <span className={styles.text}>{t.body}</span>}
          </button>
          <button type="button" className={styles.x} onClick={() => dismiss(t.id)} aria-label="Dismiss">
            <Icon name="close" size={15} />
          </button>
          <span className={styles.timer} aria-hidden="true" />
        </div>
      ))}
    </div>
  );
}
