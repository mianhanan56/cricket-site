import { getApiPlayerProfile } from '@/lib/api';
import { shareCard, shareImage } from '@/lib/brandImage';

export const alt = 'Player preview card';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const revalidate = 3600;

export default async function PlayerImage({ params }: { params: { id: string } }) {
  const player = await getApiPlayerProfile(params.id, { revalidate }).catch(() => null);
  if (!player) return shareImage();

  const bat = [...player.batting].sort((a, b) => b.runs - a.runs)[0];
  const bowl = [...player.bowling].sort((a, b) => b.wickets - a.wickets)[0];
  const career = [
    bat?.runs ? `${bat.runs.toLocaleString('en')} ${bat.format} runs at ${bat.average.toFixed(2)}` : '',
    bowl?.wickets ? `${bowl.wickets} ${bowl.format} wickets` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return shareCard({
    eyebrow: 'Player',
    headline: player.name,
    lines: [[player.role, player.countryShortName].filter(Boolean).join(' · '), career].filter(Boolean),
  });
}
