'use client';

import { useEffect, useState } from 'react';
import styles from './ThemeToggle.module.scss';

type Theme = 'light' | 'dark';

// The initial data-theme is written by the inline no-flash script in layout.tsx
// before hydration; here we just read it back and keep it in sync on toggle.
function currentTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  return (document.documentElement.getAttribute('data-theme') as Theme) ?? 'light';
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTheme(currentTheme());
    setMounted(true);
  }, []);

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('theme', next);
    } catch {
      /* storage unavailable — fall back to session-only theme */
    }
  };

  return (
    <button
      className={styles.toggle}
      onClick={toggle}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      title="Toggle theme"
    >
      {/* Render the icon for the theme you'd switch TO. Suppress hydration
          mismatch: server always emits the light-default icon. */}
      {mounted && theme === 'dark' ? (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}
