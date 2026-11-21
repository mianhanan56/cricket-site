export type Theme = 'light' | 'dark';

/** Matches --bg in scss/global.scss for each theme. */
export const THEME_COLOR: Record<Theme, string> = { light: '#f2f5f0', dark: '#0c1413' };

/** One theme-color tag, created here or by the head script in app/layout.tsx. */
export function paintThemeColor(theme: Theme): void {
  const tags = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
  tags.forEach((m, i) => (i === 0 ? (m.content = THEME_COLOR[theme]) : m.remove()));
  if (tags.length) return;
  const meta = document.createElement('meta');
  meta.name = 'theme-color';
  meta.content = THEME_COLOR[theme];
  document.head.appendChild(meta);
}
