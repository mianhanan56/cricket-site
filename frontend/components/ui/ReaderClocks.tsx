'use client';

import { useSyncExternalStore } from 'react';
import { readerZone } from '@/lib/datetime';
import { PKT_ZONE, pktToZone } from '@/lib/pakistanTime';

const subscribe = () => () => {};

/** Commentary text with its PKT stamps in the reader's zone; the server and hydration pass render PKT. */
export default function ReaderClocks({ text, at }: { text: string; at?: number | string }) {
  const zone = useSyncExternalStore(subscribe, readerZone, () => PKT_ZONE);
  const anchor = at === undefined ? undefined : typeof at === 'number' ? at : Date.parse(at);
  return <>{pktToZone(text, zone, anchor && anchor > 1e12 ? anchor : undefined)}</>;
}
