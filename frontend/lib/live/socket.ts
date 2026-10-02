'use client';

// One WebSocket to the Worker's live hub per page, held outside React so no
// render or remount can open a second. Polling stays underneath: a healthy
// topic slows its store's poll to a reconcile; no socket leaves it unchanged.

import { useSyncExternalStore } from 'react';
import { CREX_WORKER_URL } from '../crex';
import { withTimeout } from '../timeout';
import { acceptFrame, isLiveFrame, type FrameVerdict, type LiveFrame, type SeqBook } from './frames';

export type LiveStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'unavailable' | 'disabled';

type Handler = (frame: LiveFrame, verdict: FrameVerdict) => void;

const ENABLED = process.env.NEXT_PUBLIC_LIVE_WS !== 'off';
const WORKER = CREX_WORKER_URL.replace(/\/$/, '');
const LIVE_URL = process.env.NEXT_PUBLIC_LIVE_WS_URL ?? `${WORKER.replace(/^http/, 'ws')}/live`;

const HEARTBEAT_MS = 25_000;
// Two missed pongs and the connection is treated as dead, even if the browser hasn't noticed.
const SILENCE_MS = 65_000;
const MAX_RETRY_MS = 30_000;
// A Worker without the hub fails every handshake; past this many, retry slowly.
const UNAVAILABLE_AFTER = 5;
const UNAVAILABLE_RETRY_MS = 120_000;
// Navigating between pages drops and re-adds topics; don't hang up in between.
const IDLE_CLOSE_MS = 20_000;
// A hung probe would hold `probing` and keep the socket shut for the whole page.
const PROBE_TIMEOUT_MS = 10_000;

const live = {
  ws: null as WebSocket | null,
  status: (ENABLED ? 'idle' : 'disabled') as LiveStatus,
  topics: new Map<string, Set<Handler>>(),
  /** Topics that have delivered a frame on the current connection. */
  ready: new Set<string>(),
  book: new Map() as SeqBook,
  failures: 0,
  everOpened: false,
  lastMessageAt: 0,
  retryTimer: null as ReturnType<typeof setTimeout> | null,
  heartbeat: null as ReturnType<typeof setInterval> | null,
  idleTimer: null as ReturnType<typeof setTimeout> | null,
  statusListeners: new Set<() => void>(),
  resyncListeners: new Set<() => void>(),
  bound: false,
  version: 0,
  /** Whether the Worker serves /live: null until asked, and skipped for an explicit socket URL. */
  capable: (process.env.NEXT_PUBLIC_LIVE_WS_URL ? true : null) as boolean | null,
  probing: false,
};

function notify() {
  live.version += 1;
  live.statusListeners.forEach((l) => l());
}

function setStatus(next: LiveStatus) {
  if (live.status === next) return;
  live.status = next;
  notify();
}

function send(message: object) {
  if (live.ws?.readyState === WebSocket.OPEN) live.ws.send(JSON.stringify(message));
}

function clearTimers() {
  if (live.heartbeat) clearInterval(live.heartbeat);
  live.heartbeat = null;
  if (live.retryTimer) clearTimeout(live.retryTimer);
  live.retryTimer = null;
}

/** Forget a socket without waiting on its close handshake, which a dead link may never finish. */
function drop(socket: WebSocket) {
  socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
  try {
    socket.close(1000);
  } catch {
    // Already closing.
  }
  if (live.ws === socket) live.ws = null;
  if (live.heartbeat) clearInterval(live.heartbeat);
  live.heartbeat = null;
  if (live.ready.size) {
    live.ready.clear();
    notify();
  }
}

function scheduleRetry() {
  if (!live.topics.size) return setStatus('idle');
  live.failures += 1;
  // Only a Worker that has never answered is written off; an outage keeps retrying at the normal cap.
  const unavailable = !live.everOpened && live.failures >= UNAVAILABLE_AFTER;
  setStatus(unavailable ? 'unavailable' : 'reconnecting');
  // A hidden tab reconnects when it comes back rather than on a throttled timer.
  if (document.visibilityState === 'hidden') return;
  const delay = unavailable
    ? UNAVAILABLE_RETRY_MS
    : Math.min(1_000 * 2 ** (live.failures - 1), MAX_RETRY_MS) + Math.random() * 500;
  live.retryTimer = setTimeout(() => {
    live.retryTimer = null;
    connect();
  }, delay);
}

function onFrame(raw: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }
  if (!isLiveFrame(parsed)) return;
  const handlers = live.topics.get(parsed.topic);
  if (!handlers?.size) return;
  const verdict = acceptFrame(live.book, parsed);
  if (verdict === 'skip') return;
  if (!live.ready.has(parsed.topic)) {
    live.ready.add(parsed.topic);
    notify();
  }
  handlers.forEach((h) => h(parsed as LiveFrame, verdict));
}

/**
 * Ask /health once whether this Worker has the hub. A deployment from before it
 * would fail every handshake, and each failure is a console error in every tab.
 */
function probe() {
  live.probing = true;
  setStatus('connecting');
  fetch(`${WORKER}/health`, { cache: 'no-store', signal: withTimeout(PROBE_TIMEOUT_MS) })
    .then((res) => res.json())
    .then((health: { live?: unknown }) => {
      live.capable = Boolean(health?.live);
    })
    // Unreachable says nothing about the hub; let the socket's own retries handle it.
    .catch(() => {
      live.capable = true;
    })
    .finally(() => {
      live.probing = false;
      if (live.capable) connect();
      else setStatus('unavailable');
    });
}

function connect() {
  if (!ENABLED || typeof window === 'undefined' || !live.topics.size) return;
  const current = live.ws;
  if (current && (current.readyState === WebSocket.CONNECTING || current.readyState === WebSocket.OPEN)) return;
  if (live.retryTimer || live.probing || live.capable === false) return;
  bindLifecycle();
  if (live.capable === null) return probe();

  setStatus(live.everOpened || live.failures ? 'reconnecting' : 'connecting');
  let socket: WebSocket;
  try {
    socket = new WebSocket(LIVE_URL);
  } catch {
    scheduleRetry();
    return;
  }
  live.ws = socket;

  socket.onopen = () => {
    const reconnected = live.everOpened;
    live.everOpened = true;
    live.failures = 0;
    live.lastMessageAt = Date.now();
    setStatus('open');
    if (live.topics.size) send({ type: 'subscribe', topics: [...live.topics.keys()] });
    live.heartbeat = setInterval(() => {
      if (Date.now() - live.lastMessageAt > SILENCE_MS) {
        drop(socket);
        scheduleRetry();
        return;
      }
      send({ type: 'ping' });
    }, HEARTBEAT_MS);
    // Whatever happened while the socket was down is only on the API now.
    if (reconnected) live.resyncListeners.forEach((l) => l());
  };
  socket.onmessage = (e) => {
    live.lastMessageAt = Date.now();
    if (typeof e.data === 'string') onFrame(e.data);
  };
  socket.onclose = () => {
    drop(socket);
    scheduleRetry();
  };
  socket.onerror = () => {
    // A close event always follows; the retry is scheduled there.
  };
}

function reconnectNow() {
  if (!live.topics.size) return;
  const open = live.ws?.readyState === WebSocket.OPEN || live.ws?.readyState === WebSocket.CONNECTING;
  if (open) return;
  clearTimers();
  live.failures = Math.min(live.failures, UNAVAILABLE_AFTER - 1);
  connect();
}

function bindLifecycle() {
  if (live.bound) return;
  live.bound = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') reconnectNow();
  });
  window.addEventListener('online', reconnectNow);
  // Closing on pagehide keeps the page eligible for the back/forward cache.
  window.addEventListener('pagehide', () => {
    if (live.ws) drop(live.ws);
    clearTimers();
  });
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) reconnectNow();
  });
}

/**
 * Receive a topic's frames. The socket opens with the first subscription and
 * closes a little after the last one goes. Returns the unsubscribe.
 */
export function subscribeLive(topic: string, handler: Handler): () => void {
  if (!ENABLED || typeof window === 'undefined') return () => undefined;
  if (live.idleTimer) clearTimeout(live.idleTimer);
  live.idleTimer = null;

  let handlers = live.topics.get(topic);
  if (!handlers) {
    handlers = new Set();
    live.topics.set(topic, handlers);
    send({ type: 'subscribe', topics: [topic] });
  }
  handlers.add(handler);
  connect();

  return () => {
    const set = live.topics.get(topic);
    if (!set?.delete(handler) || set.size) return;
    live.topics.delete(topic);
    live.book.delete(topic);
    if (live.ready.delete(topic)) notify();
    send({ type: 'unsubscribe', topics: [topic] });
    if (live.topics.size) return;
    live.idleTimer = setTimeout(() => {
      live.idleTimer = null;
      if (live.topics.size) return;
      if (live.ws) drop(live.ws);
      clearTimers();
      live.failures = 0;
      setStatus('idle');
    }, IDLE_CLOSE_MS);
  };
}

/** True once a topic has delivered on the connection that is open now. */
export function isTopicLive(topic: string): boolean {
  return live.status === 'open' && live.ready.has(topic);
}

export function getLiveStatus(): LiveStatus {
  return live.status;
}

/** Called whenever the status or any topic's readiness changes. */
export function onLiveChange(listener: () => void): () => void {
  live.statusListeners.add(listener);
  return () => live.statusListeners.delete(listener);
}

/** Called after a reconnect, when anything missed while down has to come from the API. */
export function onLiveResync(listener: () => void): () => void {
  live.resyncListeners.add(listener);
  return () => live.resyncListeners.delete(listener);
}

export function useLiveStatus(): LiveStatus {
  return useSyncExternalStore(onLiveChange, getLiveStatus, () => (ENABLED ? 'idle' : 'disabled'));
}
