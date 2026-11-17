import { useLayoutEffect, useRef } from 'react';

export const scrollBehavior = (): ScrollBehavior => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';

/** Capture old geometry before a command, then animate the committed layout without changing data order. */
export function useWeekMotion(order: string) {
  const root = useRef<HTMLDivElement>(null);
  const pending = useRef<{ boxes: Map<string, number>; selected?: string; reveal?: string } | null>(null);
  const animations = useRef<Animation[]>([]);
  const capture = (selected?: string, reveal?: string) => {
    const boxes = new Map([...root.current?.querySelectorAll<HTMLElement>('[data-week-sheet]') ?? []]
      .map((element) => [element.dataset.weekSheet!, element.getBoundingClientRect().top + window.scrollY]));
    animations.current.forEach((animation) => animation.cancel());
    animations.current = [];
    pending.current = { selected, reveal, boxes };
  };
  useLayoutEffect(() => {
    const change = pending.current;
    if (!change) return;
    pending.current = null;
    const reduced = scrollBehavior() !== 'smooth';
    const elements = root.current?.querySelectorAll<HTMLElement>('[data-week-sheet]') ?? [];
    for (const element of elements) {
      const id = element.dataset.weekSheet!;
      const previous = change.boxes.get(id);
      const delta = previous === undefined ? 0 : previous - (element.getBoundingClientRect().top + window.scrollY);
      if (delta && !reduced) animations.current.push(element.animate([
        { transform: `translateY(${delta}px)`, opacity: 1 },
        { opacity: id === change.selected ? 1 : 0.35, offset: 0.35 },
        { transform: 'translateY(0)', opacity: 1 },
      ], { duration: 380, easing: 'cubic-bezier(.2,.7,.2,1)' }));
      if (id === change.reveal) {
        element.scrollIntoView({ block: 'start', behavior: scrollBehavior() });
        if (!reduced) animations.current.push(element.animate([
          { backgroundColor: 'color-mix(in oklab, var(--color-gold) 7%, transparent)' },
          { backgroundColor: 'transparent' },
        ], { duration: 1600, easing: 'ease-out' }));
        element.querySelector<HTMLElement>('h3')?.focus({ preventScroll: true });
      }
    }
  }, [order]);
  useLayoutEffect(() => () => animations.current.forEach((animation) => animation.cancel()), []);
  const collapse = async (id: string) => {
    const element = [...root.current?.querySelectorAll<HTMLElement>('[data-week-sheet]') ?? []].find((item) => item.dataset.weekSheet === id);
    if (!element || scrollBehavior() !== 'smooth') return true;
    const animation = element.animate([
      { height: `${element.offsetHeight}px`, opacity: 1, overflow: 'hidden' },
      { height: '0px', opacity: 0, paddingTop: '0px', paddingBottom: '0px', marginBottom: '-32px', overflow: 'hidden', transform: 'translateY(-8px)' },
    ], { duration: 240, easing: 'ease-in', fill: 'forwards' });
    animations.current.push(animation);
    try { await animation.finished; return true; } catch { return false; }
  };
  return { root, capture, collapse };
}
