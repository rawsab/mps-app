import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

/** How long one ‹ › step takes. */
const STEP_MS = 650;

export type ScrollStrip = ReturnType<typeof useScrollStrip>;

/**
 * Scroll state for a sideways strip: whether there's more to either side, and a step of most of
 * the visible width, for the ‹ › buttons beside it.
 */
export function useScrollStrip(itemCount: number) {
  const ref = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ back: false, forward: false });
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdges({ back: el.scrollLeft > 1, forward: el.scrollLeft + el.clientWidth < el.scrollWidth - 1 });
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => { el.removeEventListener('scroll', measure); observer.disconnect(); };
  }, [measure, itemCount]);
  const animation = useRef(0);
  useEffect(() => () => cancelAnimationFrame(animation.current), []);
  /**
   * Moves most of a view's width and lands on a card's start. Animated by hand, because native
   * smooth scrolling is too quick and can't be slowed. The strip has no CSS snapping: re-enabling
   * it after the animation made browsers jump back to the card they had last snapped to.
   */
  const step = (direction: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const wanted = el.scrollLeft + direction * el.clientWidth * 0.8;
    const starts = Array.from(el.children, (child) => (child as HTMLElement).offsetLeft);
    const nearest = starts.reduce((best, x) => (Math.abs(x - wanted) < Math.abs(best - wanted) ? x : best), wanted);
    const target = Math.max(0, Math.min(max, nearest));
    const from = el.scrollLeft;
    cancelAnimationFrame(animation.current);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.scrollLeft = target;
      return;
    }
    const began = performance.now();
    const frame = (now: number) => {
      const t = Math.min(1, (now - began) / STEP_MS);
      const eased = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
      el.scrollLeft = from + (target - from) * eased;
      if (t < 1) animation.current = requestAnimationFrame(frame);
    };
    animation.current = requestAnimationFrame(frame);
  };
  return { ref, ...edges, step };
}

/** Class for each `<li>` in a strip: a fixed-width card that never shrinks. */
export const STRIP_ITEM = 'flex w-72 max-w-[85%] shrink-0';

const STRIP_FADE = 'pointer-events-none absolute bottom-2 top-0 w-12 from-ink to-transparent transition-opacity duration-200 motion-reduce:transition-none';

/**
 * One sideways-scrolling row of cards. Fades in the page colour over edges that hide more cards;
 * the bottom stays clear of the scrollbar.
 */
export function ScrollStripList({ strip, children }: { strip: ScrollStrip; children: ReactNode }) {
  return (
    <div className="relative min-w-0">
      <ul ref={strip.ref} className="relative flex w-full min-w-0 gap-3 overflow-x-auto overscroll-x-contain pb-2">
        {children}
      </ul>
      <div aria-hidden className={`${STRIP_FADE} left-0 bg-linear-to-r ${strip.back ? 'opacity-100' : 'opacity-0'}`} />
      <div aria-hidden className={`${STRIP_FADE} right-0 bg-linear-to-l ${strip.forward ? 'opacity-100' : 'opacity-0'}`} />
    </div>
  );
}

const STRIP_BUTTON = 'flex size-8 items-center justify-center rounded-card border border-line text-muted transition-colors hover:bg-surface-raised hover:text-text disabled:pointer-events-none disabled:opacity-40';

/** A centred chevron for the strip's ‹ › buttons. */
function StripChevron({ back = false }: { back?: boolean }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={`size-5 ${back ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="m9.5 6 6 6-6 6" />
    </svg>
  );
}

/** The ‹ › buttons, shown only while the strip overflows. */
export function ScrollStripButtons({ strip, backLabel, forwardLabel }: { strip: ScrollStrip; backLabel: string; forwardLabel: string }) {
  if (!strip.back && !strip.forward) return null;
  return (
    <div className="flex gap-1">
      <button type="button" aria-label={backLabel} disabled={!strip.back} onClick={() => strip.step(-1)} className={STRIP_BUTTON}><StripChevron back /></button>
      <button type="button" aria-label={forwardLabel} disabled={!strip.forward} onClick={() => strip.step(1)} className={STRIP_BUTTON}><StripChevron /></button>
    </div>
  );
}
