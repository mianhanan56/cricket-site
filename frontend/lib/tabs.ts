// URL vocabularies for every tab row in the app.
//
// These live in a plain module, not next to the components that render them: a
// `'use client'` module's exports become client references, so a server page
// that imported the key list from one would get a proxy instead of an array
// ("Attempted to call includes() from the server"). The server pages validate
// ?params against these, the client components render from the same lists.

import type { MatchFormat } from '@/types';

// --- Home (/?tab=…) ---------------------------------------------------------
export type HomeTab = 'live' | 'upcoming' | 'finished' | 'series';
export const HOME_TAB_KEYS: readonly HomeTab[] = ['live', 'upcoming', 'finished', 'series'];

// --- Fixtures (/fixtures?format=…) ------------------------------------------
export type FixtureFormatKey = 'all' | 't20' | 'odi' | 'test';
export const FIXTURE_FORMAT_TABS: ReadonlyArray<{
  key: FixtureFormatKey;
  label: string;
  /** null on "all" — no format constraint. */
  format: MatchFormat | null;
}> = [
  { key: 'all', label: 'All', format: null },
  { key: 't20', label: 'T20', format: 'T20' },
  { key: 'odi', label: 'ODI', format: 'ODI' },
  { key: 'test', label: 'TEST', format: 'TEST' },
];
export const FIXTURE_FORMAT_KEYS: readonly FixtureFormatKey[] = FIXTURE_FORMAT_TABS.map(
  (t) => t.key
);

// --- Rankings (/rankings?format=…&gender=…&category=…) ----------------------
export type RankingsFormat = 'test' | 'odi' | 't20i';
export type RankingsGender = 'men' | 'women';
export type RankingsCategory = 'batting' | 'bowling' | 'all-rounder';

export const RANKINGS_FORMAT_KEYS: readonly RankingsFormat[] = ['test', 'odi', 't20i'];
export const RANKINGS_GENDER_KEYS: readonly RankingsGender[] = ['men', 'women'];
export const RANKINGS_CATEGORY_KEYS: readonly RankingsCategory[] = [
  'batting',
  'bowling',
  'all-rounder',
];
