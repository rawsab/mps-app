import { useTheme } from '@/lib/theme';

const SunIcon = () => (
  <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);

const MoonIcon = () => (
  <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
    <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
  </svg>
);

/**
 * Both icons stay mounted and cross-fade through a blur: the outgoing one blurs away while the
 * incoming one sharpens into place (see .theme-icon in index.css).
 */
export function ThemeToggle() {
  const [theme, toggle] = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className="btn-motion relative inline-flex size-11 items-center justify-center rounded-card text-muted hover:bg-surface-raised hover:text-text"
    >
      {/* The icon shows the mode you would switch to. */}
      <span className="theme-icon" data-shown={theme === 'dark' || undefined}>
        <SunIcon />
      </span>
      <span className="theme-icon" data-shown={theme === 'light' || undefined}>
        <MoonIcon />
      </span>
    </button>
  );
}
