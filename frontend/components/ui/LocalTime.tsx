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

// The zone is only known in the browser: SERVER_ZONE renders first, the reader's zone after
// mount, and suppressHydrationWarning covers that deliberate one-frame mismatch.
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
