export interface Broadcaster {
  name: string;
  /** The broadcaster's own site; null where we don't know one for certain. */
  url: string | null;
}

// Official sites only, matched on the name as the feed spells it. Anything else is listed unlinked.
const KNOWN: ReadonlyArray<[RegExp, string, string]> = [
  [/^fan\s*code$/i, 'FanCode', 'https://www.fancode.com'],
  [/^sony\s*liv$/i, 'Sony LIV', 'https://www.sonyliv.com'],
  [/^sony sports/i, '', 'https://www.sonysportsnetwork.com'],
  [/^euro\s*sport/i, 'Eurosport', 'https://www.eurosport.com/cricket/'],
  [/^(star sports|jio\s*hotstar|hotstar|disney\+ hotstar)/i, '', 'https://www.hotstar.com'],
  [/^jio\s*cinema$/i, 'JioCinema', 'https://www.hotstar.com'],
  [/^sky sports?$/i, 'Sky Sports', 'https://www.skysports.com/cricket'],
  [/^sky sport (nz|new zealand)$/i, '', 'https://www.skysportnow.co.nz'],
  [/^willow/i, '', 'https://www.willow.tv'],
  [/^kayo/i, '', 'https://kayosports.com.au'],
  [/^fox (cricket|sports)$/i, '', 'https://www.foxsports.com.au/cricket'],
  [/^(amazon )?prime video$/i, 'Prime Video', 'https://www.primevideo.com'],
  [/^super\s*sport/i, 'SuperSport', 'https://supersport.com/cricket'],
  [/^tnt sports$/i, 'TNT Sports', 'https://www.tntsports.co.uk/cricket'],
  [/^bbc/i, '', 'https://www.bbc.co.uk/sport/cricket'],
  [/^(channel 9|9now)$/i, '', 'https://www.9now.com.au'],
  [/^(seven|7plus|channel 7)$/i, '', 'https://7plus.com.au'],
];

/** The feed's broadcaster list ("FANCODE, EURO SPORT"), split, tidied and linked where we know the site. */
export function broadcasters(names: readonly string[]): Broadcaster[] {
  const seen = new Set<string>();
  const out: Broadcaster[] = [];
  for (const raw of names.flatMap((n) => n.split('&'))) {
    const name = raw.trim();
    if (!name) continue;
    const known = KNOWN.find(([pattern]) => pattern.test(name));
    const entry = { name: known?.[1] || name, url: known?.[2] ?? null };
    const key = entry.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out;
}
