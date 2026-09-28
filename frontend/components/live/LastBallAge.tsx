'use client';

import { useEffect, useState } from 'react';

function age(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

/** How old the newest delivery is, from the feed's own timestamp — never the poll's. */
export default function LastBallAge({ iso, className }: { iso: string; className?: string }) {
  const [now, setNow] = useState<number | null>(null);
  const at = Date.parse(iso);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      timer = setTimeout(tick, t - at < 60_000 ? 1000 : 15_000);
    };
    tick();
    return () => clearTimeout(timer);
  }, [at]);

  if (now === null || !Number.isFinite(at)) return null;
  return (
    <span className={className}>
      <time dateTime={iso}>Last ball {age(now - at)}</time>
    </span>
  );
}
