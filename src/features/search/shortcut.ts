import { useEffect } from 'react';

type NavigatorWithPlatform = Navigator & { userAgentData?: { platform?: string } };

/** ⌘ on Apple devices, Ctrl everywhere else. */
export const isApplePlatform = () => {
  if (typeof navigator === 'undefined') return false;
  return /mac|iphone|ipad|ipod/i.test((navigator as NavigatorWithPlatform).userAgentData?.platform || navigator.platform || '');
};

export function searchShortcut() {
  const apple = isApplePlatform();
  return { label: apple ? '⌘K' : 'Ctrl K', aria: apple ? 'Meta+K' : 'Control+K', apple };
}

/**
 * ⌘K / Ctrl+K anywhere in the coach app toggles search. It won't open over another dialog (an
 * unsaved form would be lost on navigating), except the navigation drawer.
 */
export function useSearchShortcut(open: boolean, setOpen: (open: boolean) => void) {
  useEffect(() => {
    const apple = isApplePlatform();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'k' || e.altKey || e.shiftKey || e.repeat) return;
      if (apple ? !e.metaKey || e.ctrlKey : !e.ctrlKey || e.metaKey) return;
      if (!open && document.querySelector('dialog[open]:not(.drawer):not([data-leaving])')) return;
      e.preventDefault();
      setOpen(!open);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, setOpen]);
}
