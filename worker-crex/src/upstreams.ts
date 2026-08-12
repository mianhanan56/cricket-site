// crex.com does not have one API — it has five, and which host serves a given
// endpoint is decided by the Angular service that calls it. The names below are
// the ones crex's own bundle uses in its environment config, kept verbatim so a
// future re-check against their bundle is a straight comparison.
//
//   url           -> the default base; most endpoints live here
//   newUrl        -> stats / detailed rankings
//   commentaryUrl -> ball-by-ball feeds
//   newsUrl       -> editorial content
//   phpBaseUrl    -> the legacy PHP tier; the live match list lives here
//
// Deliberately absent: cricket-exchange.firebaseio.com. crex streams live
// scores out of a Firebase Realtime Database using credentials embedded in
// their JS bundle. Proxying their REST endpoints is one thing; authenticating
// into their Firebase project with keys lifted from their frontend is another,
// so this Worker does not do it. See README.

export const UPSTREAMS = {
  oc: 'https://oc.crickapi.com',
  stats: 'https://stats.crickapi.com',
  content: 'https://content.crickapi.com',
  news: 'https://crexweb.crickapi.com',
  php: 'https://api.goscorer.com/api/v3',
} as const;

export type UpstreamName = keyof typeof UPSTREAMS;
