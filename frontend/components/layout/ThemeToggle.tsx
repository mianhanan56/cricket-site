'use client';

import { useEffect, useState } from 'react';
import Icon from '../ui/Icon';
import styles from './ThemeToggle.module.scss';

type Theme = 'light' | 'dark';

const current = (): Theme =>
  typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'light'
    ? 'light'
    : 'dark';

export function setTheme(next: Theme) {
  document.documentElement.setAttribute('data-theme', next);
  try {
    localStorage.setItem('theme', next);
  } catch {
    // Storage blocked — the theme holds for this session only.
  }
  window.dispatchEvent(new Event('pc-theme'));
}

export function useTheme(): Theme | null {
  const [theme, setThemeState] = useState<Theme | null>(null);
  useEffect(() => {
    const sync = () => setThemeState(current());
    sync();
    window.addEventListener('pc-theme', sync);
    return () => window.removeEventListener('pc-theme', sync);
  }, []);
  return theme;
}

export default function ThemeToggle() {
  const theme = useTheme();
  const next: Theme = theme === 'light' ? 'dark' : 'light';

  return (
    <button
      type="button"
      className={styles.toggle}
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} mode`}
    >
      <span className={styles.icon} data-theme-icon={theme ?? 'dark'}>
        <Icon name={theme === 'light' ? 'moon' : 'sun'} size={18} />
      </span>
    </button>
  );
}
