'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Long enough that sweeping the pointer down a list warms nothing.
const HOVER_INTENT_MS = 80;

/**
 * Prefetches `ON_INTENT` links when a reader shows intent, one listener for the whole page.
 * `prefetch={false}` alone also drops Next's own hover prefetch, which would make every
 * list click a cold render. Renders nothing.
 */
export default function IntentPrefetch() {
  const router = useRouter();

  useEffect(() => {
    let timer = 0;
    let warmed = '';
    const hrefOf = (e: Event) =>
      (e.target as Element | null)?.closest?.('a[data-prefetch="intent"]')?.getAttribute('href') ?? null;
    const warm = (href: string | null) => {
      if (!href || href === warmed) return;
      warmed = href;
      router.prefetch(href);
    };

    const onOver = (e: Event) => {
      window.clearTimeout(timer);
      const href = hrefOf(e);
      if (href) timer = window.setTimeout(() => warm(href), HOVER_INTENT_MS);
    };
    const onNow = (e: Event) => warm(hrefOf(e));

    document.addEventListener('pointerover', onOver, { passive: true });
    document.addEventListener('touchstart', onNow, { passive: true });
    document.addEventListener('focusin', onNow);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('pointerover', onOver);
      document.removeEventListener('touchstart', onNow);
      document.removeEventListener('focusin', onNow);
    };
  }, [router]);

  return null;
}
