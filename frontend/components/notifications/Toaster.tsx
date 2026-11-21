'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { markRead, onToast, type PulseNotification } from '@/lib/notifications';
import Icon from '../ui/Icon';
import { KIND_LABEL } from './NotificationCenter';
import styles from './Toaster.module.scss';

const TOAST_MS = 6500;

/** Counts down only while unpaused, keeping what's left across pauses. */
function useCountdown(paused: boolean, onDone: () => void) {
  const remaining = useRef(TOAST_MS);
  useEffect(() => {
    if (paused) return;
    const started = Date.now();
    const timer = window.setTimeout(onDone, remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current -= Date.now() - started;
    };
  }, [paused, onDone]);
}

export default function Toaster() {
  const router = useRouter();
  const [toasts, setToasts] = useState<PulseNotification[]>([]);
  // Hover or focus anywhere on the stack holds every toast (WCAG 2.2.1).
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const stackRef = useRef<HTMLDivElement>(null);
  const paused = hovered || focused;

  useEffect(() => onToast((t) => setToasts((prev) => [t, ...prev].slice(0, 3))), []);

  // Removing a toast fires no pointerleave under a still pointer, and no blur in Firefox/Safari.
  useEffect(() => {
    setFocused(Boolean(stackRef.current?.contains(document.activeElement)));
    if (!toasts.length) setHovered(false);
  }, [toasts]);

  const dismiss = useCallback((id: string) => setToasts((prev) => prev.filter((x) => x.id !== id)), []);

  return (
    <div
      ref={stackRef}
      className={`${styles.stack} ${paused ? styles.paused : ''}`}
      aria-live="polite"
      aria-relevant="additions"
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      {toasts.map((t) => (
        <Toast
          key={t.id}
          toast={t}
          paused={paused}
          onDismiss={dismiss}
          onOpen={() => {
            markRead(t.id);
            dismiss(t.id);
            if (t.href) router.push(t.href);
          }}
        />
      ))}
    </div>
  );
}

function Toast({
  toast: t,
  paused,
  onDismiss,
  onOpen,
}: {
  toast: PulseNotification;
  paused: boolean;
  onDismiss: (id: string) => void;
  onOpen: () => void;
}) {
  const expire = useCallback(() => onDismiss(t.id), [onDismiss, t.id]);
  useCountdown(paused, expire);

  return (
    <div className={`${styles.toast} ${styles[t.kind] ?? ''}`}>
      <button type="button" className={styles.body} onClick={onOpen}>
        <span className={styles.kind}>{KIND_LABEL[t.kind]}</span>
        <span className={styles.title}>{t.title}</span>
        {t.body && <span className={styles.text}>{t.body}</span>}
      </button>
      <button type="button" className={styles.x} onClick={() => onDismiss(t.id)} aria-label="Dismiss">
        <Icon name="close" size={15} />
      </button>
      <span className={styles.timer} aria-hidden="true" />
    </div>
  );
}
