import { getApiTeamProfile } from '@/lib/api';
import { shareCard, shareImage } from '@/lib/brandImage';

export const alt = 'Team preview card';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const revalidate = 1800;

const FORM_LETTER = { W: 'W', L: 'L', N: '–' } as const;

export default async function TeamImage({ params }: { params: { key: string } }) {
  const profile = await getApiTeamProfile(params.key, { revalidate }).catch(() => null);
  if (!profile) return shareImage();
  const { team, rankings, form, upcoming } = profile;

  const ranked = rankings.map((r) => `#${r.position} ${r.format}`).join(' · ');
  const next = upcoming[0] ? `Next: ${upcoming[0].homeTeam.shortName} vs ${upcoming[0].awayTeam.shortName}` : '';
  return shareCard({
    eyebrow: 'Team',
    headline: team.name,
    lines: [ranked || next, form.length ? `Form ${form.map((f) => FORM_LETTER[f]).join(' ')}` : ''].filter(Boolean),
  });
}
