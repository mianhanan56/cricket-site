'use client';

import { useCallback, useEffect, useState } from 'react';
import { requestSystemPermission, systemPermission, type SystemPermission } from '@/lib/notifications';

const listeners = new Set<(p: SystemPermission) => void>();
const broadcast = (p: SystemPermission) => listeners.forEach((l) => l(p));

/**
 * Browser notification permission, shared by every alerts component on the
 * page. `null` until mounted — reading it during render breaks hydration.
 */
export function useNotificationPermission() {
  const [permission, setPermission] = useState<SystemPermission | null>(null);

  useEffect(() => {
    let cancelled = false;
    let status: PermissionStatus | null = null;
    const onChange = () => broadcast(systemPermission());

    setPermission(systemPermission());
    listeners.add(setPermission);
    // Catches the reader flipping the setting from the address bar.
    navigator.permissions
      ?.query({ name: 'notifications' })
      .then((s) => {
        if (cancelled) return;
        status = s;
        s.addEventListener('change', onChange);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      listeners.delete(setPermission);
      status?.removeEventListener('change', onChange);
    };
  }, []);

  const request = useCallback(async () => {
    const next = await requestSystemPermission();
    broadcast(next);
    return next;
  }, []);

  return [permission, request] as const;
}
