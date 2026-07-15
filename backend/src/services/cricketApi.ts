// Cricket data facade.
//
// Selects the upstream provider from CRICKET_PROVIDER (defaults to CricAPI) and
// re-exports its fetchers plus the shared, provider-agnostic types and mapping
// helpers. The rest of the app imports from here and never needs to know which
// provider is active — set CRICKET_PROVIDER=cricbuzz (prod) or cricapi (local).
import * as cricapi from './providers/cricapi';
import * as cricbuzz from './providers/cricbuzz';
import type { CricketProvider } from './providers/types';

const provider: CricketProvider =
  process.env.CRICKET_PROVIDER?.toLowerCase() === 'cricbuzz' ? cricbuzz : cricapi;

/** True when the active provider has the credentials it needs. */
export const apiConfigured = provider.isConfigured;

export const fetchLiveMatches = provider.fetchLiveMatches;
export const fetchMatchInfo = provider.fetchMatchInfo;
export const fetchMatchScorecard = provider.fetchMatchScorecard;
export const fetchFixtures = provider.fetchFixtures;
export const fetchSeriesList = provider.fetchSeriesList;

// Shared contract: types + normalized mapping helpers (mapStatus, mapFormat,
// mapStartTime, mapScorecard, mergeScorecardDetail, and the Cric* interfaces).
export * from './providers/types';
