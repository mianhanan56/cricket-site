'use client';

import { useEffect, useState } from 'react';
import { countdown } from '@/lib/relativeTime';

/** "2h 14m" to a start time, ticking once a second inside the last hour. */
export default function Countdown({
  iso,
  className,
  soonClassName,
  pastLabel = 'Due to start',
}: {
  iso: string;
  className?: string;
  /** Applied inside the final hour. */
  soonClassName?: string;
  pastLabel?: string;
}) {
  const [now, setNow] = useState<number | null>(null);
  const target = new Date(iso).getTime();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      const left = target - t;
      timer = setTimeout(tick, left < 3_600_000 ? 1000 : 30_000);
    };
    tick();
    return () => clearTimeout(timer);
  }, [target]);

  if (now === null || !Number.isFinite(target)) {
    return <span className={className}>&nbsp;</span>;
  }

  const left = target - now;
  const soon = left > 0 && left < 3_600_000;
  return (
    <span className={`${className ?? ''} ${soon && soonClassName ? soonClassName : ''}`}>
      {left > 0 ? countdown(left) : pastLabel}
    </span>
  );
}
