'use client';

import { useSyncExternalStore } from 'react';

export interface Persisted<T> {
  get(): T;
  set(next: T | ((prev: T) => T)): void;
  subscribe(listener: () => void): () => void;
  use(): T;
}

/**
 * A localStorage-backed value shared by every component that reads it, kept in
 * step across tabs via the `storage` event. The server snapshot is always the
 * fallback, so hydration never disagrees with the server render.
 */
export function createPersisted<T>(
  key: string,
  fallback: T,
  validate: (raw: unknown) => T | null = (raw) => raw as T
): Persisted<T> {
  let value = fallback;
  let loaded = false;
  const listeners = new Set<() => void>();

  const read = () => {
    try {
      const raw = window.localStorage.getItem(key);
      value = raw ? validate(JSON.parse(raw)) ?? fallback : fallback;
    } catch {
      value = fallback;
    }
  };

  const load = () => {
    if (loaded || typeof window === 'undefined') return;
    loaded = true;
    read();
    window.addEventListener('storage', (e) => {
      if (e.key !== key) return;
      read();
      listeners.forEach((l) => l());
    });
  };

  const get = () => {
    load();
    return value;
  };

  const set = (next: T | ((prev: T) => T)) => {
    load();
    value = typeof next === 'function' ? (next as (prev: T) => T)(value) : next;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage full or blocked — the value still lives for this session.
    }
    listeners.forEach((l) => l());
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  const getServer = () => fallback;
  const useStore = () => useSyncExternalStore(subscribe, get, getServer);

  return { get, set, subscribe, use: useStore };
}

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export const newId = (): string =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
