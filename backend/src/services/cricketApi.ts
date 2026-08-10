// Cricket data facade.
//
// CricLive (cricketliveapi.com) is the only provider. It's reached through our
// Cloudflare Worker, so the API token lives in the Worker's secret and the
// backend needs no cricket credentials — set CRICKET_WORKER_URL and that's it.
//
// The provider indirection is kept deliberately: the rest of the app imports
// from here and speaks only the normalized CricApi* shapes, so swapping or
// adding an upstream later touches this file and nothing else.
import * as criclive from './providers/criclive';
import type { CricketProvider } from './providers/types';

const provider: CricketProvider = criclive;

/** True when the Worker URL is configured. */
export const apiConfigured = provider.isConfigured;

export const fetchLiveMatches = provider.fetchLiveMatches;
export const fetchMatchInfo = provider.fetchMatchInfo;
export const fetchMatchScorecard = provider.fetchMatchScorecard;
export const fetchFixtures = provider.fetchFixtures;
export const fetchSeriesList = provider.fetchSeriesList;

// Shared contract: types + normalized mapping helpers (mapStatus, mapFormat,
// mapStartTime, mapScorecard, mergeScorecardDetail, and the Cric* interfaces).
export * from './providers/types';
