import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';

/** Must match the key used by the pre-paint script in index.html. */
export const THEME_STORAGE_KEY = 'mps-theme';

const THEME_COLORS: Record<Theme, string> = { dark: '#0A0A0A', light: '#F6F5F1' };
const listeners = new Set<() => void>();

function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null; // storage can be unavailable (private mode, blocked site data)
  }
}

function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme]);
  listeners.forEach((l) => l());
}

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

/** An explicit choice is remembered per browser; otherwise the OS preference is followed. */
export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Still switch for this visit even if it cannot be remembered.
  }
  apply(theme);
}

if (typeof window !== 'undefined') {
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    if (!storedTheme()) apply(systemTheme());
  });
}

export function useTheme(): [Theme, () => void] {
  const theme = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    currentTheme,
  );
  return [theme, () => setTheme(theme === 'dark' ? 'light' : 'dark')];
}
