'use client';

import { useEffect, useState } from 'react';
import { SERVER_ZONE, formatInZone, readerZone, type DateStyle } from '@/lib/datetime';

export interface LocalTimeProps {
  /** The instant, as an ISO string. */
  iso: string;
  /** Which shape to render — see `DateStyle`. */
  format: DateStyle;
  /** "6:30 pm" rather than "6:30 PM", where the surrounding type wants it quiet. */
  lower?: boolean;
  className?: string;
}

/**
 * An instant, in the reader's own timezone.
 *
 * The zone is only knowable in the browser, so this renders `SERVER_ZONE` for
 * the server pass and the first paint, then re-renders in the reader's zone on
 * mount. `suppressHydrationWarning` covers the one frame where the two differ —
 * React would otherwise report the corrected text as a mismatch, which it is,
 * deliberately.
 *
 * A reader already in UTC sets the same value and never re-renders at all.
 *
 * `<time dateTime>` carries the unambiguous instant alongside the rendered
 * string, so the markup stays correct for anything reading it rather than
 * looking at it.
 */
export default function LocalTime({ iso, format, lower, className }: LocalTimeProps) {
  const [zone, setZone] = useState(SERVER_ZONE);

  useEffect(() => setZone(readerZone()), []);

  const text = formatInZone(iso, format, zone);

  return (
    <time dateTime={iso} className={className} suppressHydrationWarning>
      {lower ? text.toLowerCase() : text}
    </time>
  );
}
