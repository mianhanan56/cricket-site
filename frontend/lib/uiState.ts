'use client';

import { useSyncExternalStore } from 'react';

export type Overlay = 'search' | 'notifications' | 'menu' | null;

let overlay: Overlay = null;
const listeners = new Set<() => void>();

export function openOverlay(next: Overlay) {
  if (overlay === next) return;
  overlay = next;
  listeners.forEach((l) => l());
}

export const closeOverlay = () => openOverlay(null);

export const toggleOverlay = (next: Exclude<Overlay, null>) =>
  openOverlay(overlay === next ? null : next);

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const useOverlay = (): Overlay =>
  useSyncExternalStore(subscribe, () => overlay, () => null);
