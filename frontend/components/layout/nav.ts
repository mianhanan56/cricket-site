import type { IconName } from '../ui/Icon';

export interface NavLink {
  href: string;
  label: string;
  icon: IconName;
  /** Other path prefixes that light this item. */
  also?: string[];
}

export const PRIMARY_NAV: NavLink[] = [
  { href: '/', label: 'Matches', icon: 'live', also: ['/matches', '/fixtures', '/venues'] },
  { href: '/series', label: 'Series', icon: 'trophy' },
  { href: '/rankings', label: 'Rankings', icon: 'rankings', also: ['/players'] },
  { href: '/teams', label: 'Teams', icon: 'teams' },
  { href: '/insights', label: 'Insights', icon: 'insight' },
];

export function isActive(pathname: string, link: NavLink): boolean {
  const hit = (p: string) => (p === '/' ? pathname === '/' : pathname === p || pathname.startsWith(`${p}/`));
  return hit(link.href) || (link.also ?? []).some(hit);
}
