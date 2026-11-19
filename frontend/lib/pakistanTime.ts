// The upstream's commentators stamp times in IST ("2:13 PM IST, 1:43 PM Local Time: Drinks");
// readers here want Pakistan time. PKT is IST − 30 min, all year (neither zone has DST).

// "9:30 PM", "21:30", or "9 PM" — minutes may go only when AM/PM is there.
const TIME = String.raw`(\d{1,2})(?:[:.](\d{2}))?(?:\s*([AaPp])\.?\s*[Mm]\b\.?)?`;
const STAMP = new RegExp(
  String.raw`\b${TIME}\s*IST\b((?:\s*<\/?[a-z]{1,6}>)*)(?:\s*(?:&|&amp;|and)\s*Local\s+Time\b|\s*(?:,|/|and|&|&amp;)\s*${TIME}\s*Local\s+Time\b)?`,
  'g'
);

const DAY = 24 * 60;

function minutes(h: string, m: string | undefined, meridiem: string | undefined): number | null {
  if (m === undefined && !meridiem) return null;
  let hour = Number(h);
  const min = Number(m ?? 0);
  if (min > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (meridiem[0].toLowerCase() === 'p' ? 12 : 0);
  } else if (hour > 23) return null;
  return hour * 60 + min;
}

function clock(total: number, twelveHour: boolean): string {
  const t = ((total % DAY) + DAY) % DAY;
  const h = Math.floor(t / 60);
  const mm = String(t % 60).padStart(2, '0');
  if (!twelveHour) return `${String(h).padStart(2, '0')}:${mm}`;
  return `${h % 12 || 12}:${mm} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Rewrites every IST time in the upstream's text as Pakistan time, keeping the venue's local time when it differs. */
export function istToPakistan(raw: string): string {
  if (!raw.includes('IST')) return raw;
  return raw.replace(STAMP, (whole, h, m, ap, tags: string, lh, lm, lap) => {
    const ist = minutes(h, m, ap);
    if (ist === null) return whole;
    const pkt = ist - 30;
    const twelve = Boolean(ap);
    // "IST & Local Time" means the venue is on IST; a separate local stamp names its own clock.
    const local = lh !== undefined ? minutes(lh, lm, lap) : /local\s+time/i.test(whole) ? ist : null;
    // Tags between "IST" and the local stamp ("<b>2:13 PM IST</b> & Local Time") go after it.
    const after = tags.replace(/\s+/g, '');
    if (local === null) return `${clock(pkt, twelve)} PKT${after}`;
    if (local === ((pkt % DAY) + DAY) % DAY) return `${clock(pkt, twelve)} PKT & Local Time${after}`;
    return `${clock(pkt, twelve)} PKT, ${clock(local, lh !== undefined ? Boolean(lap) : twelve)} Local Time${after}`;
  });
}

/** Pakistan Standard Time: UTC+5, no DST. The server's first paint for commentary clocks. */
export const PKT_ZONE = 'Asia/Karachi';

const PKT_STAMP = /\b(\d{1,2}):(\d{2})(?: ([AP]M))? PKT(?:( (?:&|and) Local Time)|, (\d{1,2}:\d{2}(?: [AP]M)?) Local Time)?/g;
const HOUR = 60 * 60 * 1000;

// Intl gives "GMT+5" for most cricket zones in every locale; these read better.
const NAMED: Record<string, string> = {
  'Asia/Karachi': 'PKT',
  'Asia/Kolkata': 'IST',
  'Asia/Calcutta': 'IST',
  'Asia/Colombo': 'SLST',
  'Asia/Kathmandu': 'NPT',
  'Asia/Kabul': 'AFT',
  'Africa/Johannesburg': 'SAST',
};

function zoneLabel(zone: string, at: Date): string {
  if (NAMED[zone]) return NAMED[zone];
  let fallback = '';
  for (const locale of ['en-US', 'en-GB', 'en-IN', 'en-AU']) {
    const name =
      new Intl.DateTimeFormat(locale, { timeZone: zone, timeZoneName: 'short' })
        .formatToParts(at)
        .find((p) => p.type === 'timeZoneName')?.value ?? '';
    if (name && !/^GMT[+-]/.test(name)) return name;
    fallback ||= name;
  }
  return fallback;
}

/**
 * Rewrites the PKT stamps `istToPakistan` wrote in the reader's own zone. `anchor` (the note's
 * time) picks the calendar day, so a zone's DST is read for the day the note was written.
 */
export function pktToZone(text: string, zone: string, anchor: number = Date.now()): string {
  if (zone === PKT_ZONE || !text.includes('PKT')) return text;
  return text.replace(PKT_STAMP, (whole, h: string, m: string, ap?: string, samePkt?: string, other?: string) => {
    const pkt = minutes(h, m, ap);
    if (pkt === null) return whole;
    const utcMin = pkt - 5 * 60;
    const day = new Date(anchor);
    let at = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()) + utcMin * 60_000;
    if (at - anchor > 12 * HOUR) at -= 24 * HOUR;
    else if (anchor - at > 12 * HOUR) at += 24 * HOUR;
    let shown: string;
    try {
      shown = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: ap ? 'numeric' : '2-digit', minute: '2-digit', hour12: Boolean(ap) })
        .format(at)
        .toUpperCase();
    } catch {
      return whole;
    }
    const label = zoneLabel(zone, new Date(at));
    const venue = samePkt ? clock(pkt, Boolean(ap)) : other;
    if (!venue) return `${shown} ${label}`;
    return shown === venue ? `${shown} ${label} & Local Time` : `${shown} ${label}, ${venue} Local Time`;
  });
}
