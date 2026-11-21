'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { publishSearch } from '@/lib/urlSearch';

/** Mounted in its own Suspense boundary: useSearchParams() opts only this null render out of prerendering. */
export default function SearchParamsBridge() {
  const search = useSearchParams().toString();
  useEffect(() => publishSearch(search), [search]);
  return null;
}
