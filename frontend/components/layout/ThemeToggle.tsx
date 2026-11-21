'use client';

import { useEffect, useState } from 'react';
import Icon from '../ui/Icon';
import { paintThemeColor, type Theme } from './themeColor';
import styles from './ThemeToggle.module.scss';

const current = (): Theme =>
  typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark'
    ? 'dark'
    : 'light';

function setTheme(next: Theme) {
  document.documentElement.setAttribute('data-theme', next);
  try {
    localStorage.setItem('theme', next);
  } catch {
    // Storage blocked — the theme holds for this session only.
  }
  window.dispatchEvent(new Event('pc-theme'));
}

function useTheme(): Theme | null {
  const [theme, setThemeState] = useState<Theme | null>(null);
  useEffect(() => {
    const sync = () => {
      const theme = current();
      setThemeState(theme);
      paintThemeColor(theme);
    };
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
      <span className={styles.icon} data-theme-icon={theme ?? 'light'}>
        <Icon name={theme === 'light' ? 'moon' : 'sun'} size={18} />
      </span>
    </button>
  );
}
