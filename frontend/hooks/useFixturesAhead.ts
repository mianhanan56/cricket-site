'use client';

import { useEffect, useState } from 'react';
import { getCrexFixturesAhead, type Fixture } from '@/lib/crex';

const REFRESH_MS = 5 * 60_000;

/**
 * The next day or two of crex's schedule. The live feed is a window and leaves
 * out some fixtures that are already allocated, so lists of what is coming up
 * fill from here.
 */
export function useFixturesAhead(): Fixture[] {
  const [fixtures, setFixtures] = useState<Fixture[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      getCrexFixturesAhead()
        .then((rows) => !cancelled && setFixtures(rows))
        .catch(() => {});
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return fixtures;
}
