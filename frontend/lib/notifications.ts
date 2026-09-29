'use client';

import { createPersisted, isRecord, newId } from './persisted';

export type NotificationKind = 'live' | 'moment' | 'alert' | 'result';

export interface PulseNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  href?: string;
  at: number;
  read: boolean;
  automationId?: string;
  /** The alert and the event it fired for — the same wicket always has the same key. */
  eventKey?: string;
}

const MAX_KEPT = 100;
const KINDS: ReadonlySet<string> = new Set<NotificationKind>(['live', 'moment', 'alert', 'result']);

/**
 * Stored notifications, minus anything that would break the panel: an entry
 * with no id or title, a time no Date can hold (it throws on render), a
 * duplicate id or event, and fields of the wrong type. One bad row is skipped,
 * never the whole list.
 */
export function parseNotifications(raw: unknown): PulseNotification[] | null {
  if (!Array.isArray(raw)) return null;

  const seen = new Set<string>();
  const kept: PulseNotification[] = [];
  for (const n of raw) {
    if (!isRecord(n) || typeof n.id !== 'string' || typeof n.title !== 'string') continue;
    if (typeof n.at !== 'number' || !Number.isFinite(new Date(n.at).getTime())) continue;

    const eventKey = typeof n.eventKey === 'string' ? n.eventKey : undefined;
    if (seen.has(`id:${n.id}`) || (eventKey && seen.has(`event:${eventKey}`))) continue;
    seen.add(`id:${n.id}`);
    if (eventKey) seen.add(`event:${eventKey}`);

    kept.push({
      id: n.id,
      kind: typeof n.kind === 'string' && KINDS.has(n.kind) ? (n.kind as NotificationKind) : 'alert',
      title: n.title,
      body: typeof n.body === 'string' ? n.body : '',
      // Only in-app links: the panel hands this straight to the router.
      href: typeof n.href === 'string' && n.href.startsWith('/') ? n.href : undefined,
      at: n.at,
      read: n.read === true,
      automationId: typeof n.automationId === 'string' ? n.automationId : undefined,
      eventKey,
    });
    if (kept.length === MAX_KEPT) break;
  }
  return kept;
}

export const notificationsStore = createPersisted<PulseNotification[]>('pc.notifications', [], parseNotifications);

export const useNotifications = notificationsStore.use;

// Several open tabs each run the engine; a shared ledger of fired event keys
// stops the same wicket arriving once per tab.
const firedStore = createPersisted<Record<string, number>>('pc.fired', {}, (raw) =>
  isRecord(raw) ? (raw as Record<string, number>) : null
);

const FIRED_TTL_MS = 36 * 60 * 60 * 1000;

export function claimEvent(key: string): boolean {
  const now = Date.now();
  const ledger = firedStore.get();
  if (ledger[key]) return false;

  const pruned: Record<string, number> = {};
  for (const [k, at] of Object.entries(ledger)) if (now - at < FIRED_TTL_MS) pruned[k] = at;
  pruned[key] = now;
  firedStore.set(pruned);
  return true;
}

type Toast = PulseNotification;
const toastListeners = new Set<(t: Toast) => void>();

export function onToast(listener: (t: Toast) => void): () => void {
  toastListeners.add(listener);
  return () => toastListeners.delete(listener);
}

export interface PushOptions {
  kind: NotificationKind;
  title: string;
  body: string;
  href?: string;
  automationId?: string;
  eventKey?: string;
  /** Also raise a system notification when the page has permission. */
  system?: boolean;
}

export function pushNotification(opts: PushOptions): PulseNotification {
  const seen = opts.eventKey ? notificationsStore.get().find((n) => n.eventKey === opts.eventKey) : undefined;
  if (seen) return seen;

  const item: PulseNotification = {
    id: newId(),
    kind: opts.kind,
    title: opts.title,
    body: opts.body,
    href: opts.href,
    automationId: opts.automationId,
    eventKey: opts.eventKey,
    at: Date.now(),
    read: false,
  };

  notificationsStore.set((prev) => [item, ...prev].slice(0, MAX_KEPT));
  toastListeners.forEach((l) => l(item));

  if (opts.system && systemPermission() === 'granted') {
    try {
      // Tagged by event, so a repeat from a second tab replaces the first rather than stacking.
      const n = new Notification(item.title, { body: item.body, tag: item.eventKey ?? item.id, icon: '/icon.svg' });
      if (item.href) {
        n.onclick = () => {
          window.focus();
          window.location.assign(item.href as string);
        };
      }
    } catch {
      // Some mobile browsers only allow notifications from a service worker.
    }
  }

  return item;
}

export const markRead = (id: string) =>
  notificationsStore.set((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));

export const markAllRead = () =>
  notificationsStore.set((prev) => prev.map((n) => (n.read ? n : { ...n, read: true })));

export const clearNotifications = () => notificationsStore.set([]);

export const unreadCount = (list: PulseNotification[]): number =>
  list.reduce((n, item) => n + (item.read ? 0 : 1), 0);

export type SystemPermission = NotificationPermission | 'unsupported';

export function systemPermission(): SystemPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export async function requestSystemPermission(): Promise<SystemPermission> {
  if (systemPermission() === 'unsupported') return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return systemPermission();
  }
}
