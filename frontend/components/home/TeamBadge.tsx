'use client';

import { useState } from 'react';
import styles from './MatchCard.module.scss';

// Deterministic brand color per team from its short name — used only when there
// is no crest to show. Stable across renders for the same team.
export function teamHue(code: string): number {
  let h = 0;
  for (let i = 0; i < code.length; i += 1) h = (h * 31 + code.charCodeAt(i)) % 360;
  return h;
}

/**
 * Team crest, with the gradient initials badge as the fallback.
 *
 * Two reasons this is a client component rather than a plain `<img>` in
 * MatchCard: crests 404 for some domestic sides, and a broken-image icon looks
 * far worse than initials, so we need `onError`. Backend-sourced teams carry no
 * logo at all and take the same fallback path without a wasted request.
 *
 * When a crest does load it sits on a quiet neutral chip instead of the
 * gradient — most crests carry their own colour, and stacking them on a
 * saturated fill muddies both.
 */
export default function TeamBadge({
  name,
  shortName,
  logo,
}: {
  name: string;
  shortName: string;
  logo?: string | null;
}) {
  const [failed, setFailed] = useState(false);
  const showCrest = Boolean(logo) && !failed;

  if (showCrest) {
    return (
      <span className={`${styles.badge} ${styles.badgeCrest}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- crests are tiny
            (~1-5KB webp) and served from Akamai already optimized; next/image
            would add a proxy hop for no gain, and isn't used anywhere here. */}
        <img
          src={logo as string}
          alt={`${name} crest`}
          width={44}
          height={44}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      </span>
    );
  }

  const hue = teamHue(shortName);
  return (
    <span
      className={styles.badge}
      style={{
        background: `linear-gradient(135deg, hsl(${hue} 68% 52%), hsl(${(hue + 40) % 360} 62% 40%))`,
        boxShadow: `0 6px 20px -8px hsl(${hue} 68% 52%)`,
      }}
    >
      {shortName.slice(0, 3)}
    </span>
  );
}
