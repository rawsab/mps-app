import { useEffect } from 'react';
import { useLocation } from 'react-router';

/** How long a link's `#id` may take to render (the page's data loads after the route). */
const WAIT_MS = 2500;
/** How long the scroll keeps following the target while content above it is still loading in. */
const SETTLE_MS = 1500;

/**
 * Scrolls to the section a link's `#id` names once it renders, moves focus to it and briefly
 * outlines it (decision 0054). A section folded away for having nothing in it is inert, so the
 * page just opens at the top.
 */
export function useHashTarget() {
  const location = useLocation();
  useEffect(() => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (!id) return;
    const deadline = performance.now() + WAIT_MS;
    let frame = 0;
    let cleanup = () => {};

    const find = () => {
      const target = document.getElementById(id);
      if (target) {
        if (!target.closest('[inert]')) cleanup = reveal(target);
        return;
      }
      if (performance.now() < deadline) frame = requestAnimationFrame(find);
      else if (import.meta.env.DEV) console.warn(`Search target #${id} never appeared on ${location.pathname}.`);
    };
    find();
    return () => { cancelAnimationFrame(frame); cleanup(); };
  // Once per navigation, including a second visit to the same #id.
  }, [location.key]);
}

function reveal(target: HTMLElement) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
  target.setAttribute('data-hash-focus', '');
  target.focus({ preventScroll: true });

  const section = target.closest('section') ?? target;
  section.classList.remove('hash-target');
  // Restart the outline if the same section is opened twice in a row.
  void section.offsetWidth;
  section.classList.add('hash-target');
  const unmark = (e: AnimationEvent) => {
    // Children's animations bubble up too.
    if (e.target !== section) return;
    section.classList.remove('hash-target');
    section.removeEventListener('animationend', unmark);
  };
  section.addEventListener('animationend', unmark);

  // Content above may still be loading in and push the section down: follow it until it settles,
  // unless the coach starts scrolling themselves.
  const main = document.getElementById('main-content');
  const follow = new ResizeObserver(() => target.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' }));
  if (main) follow.observe(main);
  const stop = () => {
    follow.disconnect();
    for (const type of USER_SCROLL) window.removeEventListener(type, stop);
  };
  for (const type of USER_SCROLL) window.addEventListener(type, stop, { passive: true });
  const timer = window.setTimeout(stop, SETTLE_MS);
  return () => { stop(); window.clearTimeout(timer); };
}

const USER_SCROLL = ['wheel', 'touchmove', 'keydown', 'pointerdown'] as const;
