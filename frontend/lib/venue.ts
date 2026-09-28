/** What crex's mapping and the feeds both say when no ground has been named. */
export const VENUE_TBD = 'TBD';

const VENUE_UNKNOWN = /^(tbd|tba|to be (decided|announced|confirmed))$/i;

/**
 * A venue name as crex's mapping should have sent it: no control, format or
 * private-use characters (a stray box glyph opened "JB Marks Oval"), no doubled
 * spaces, no dangling separators, and every flavour of "not decided" read as TBD.
 */
export function cleanVenueName(raw: string | undefined | null): string {
  const text = (raw ?? '')
    .replace(/[\p{C}\u{FFFD}]/gu, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,;:])/g, '$1')
    .replace(/^[\s,;:.·|/\-–—]+/, '')
    .replace(/[\s,;:·|/\-–—]+$/, '')
    .trim();
  return !text || VENUE_UNKNOWN.test(text) ? VENUE_TBD : text;
}

/** A venue for running text: an undecided one reads as "Venue TBD", never a bare "TBD". */
export function venueText(venue: string | null | undefined): string {
  const v = cleanVenueName(venue);
  return v === VENUE_TBD ? 'Venue TBD' : v;
}
