import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Shared mesocycle/nutrition overflow affordance. Only edges hiding more content are shaded. */
export function SpreadsheetViewport({ children, className = 'max-h-[65vh] min-h-24 max-w-full overflow-auto' }: { children: ReactNode; className?: string }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState({ left: false, right: false });
  const measure = () => {
    const el = viewport.current;
    if (!el) return;
    const next = { left: el.scrollLeft > 2, right: el.scrollWidth - el.clientWidth - el.scrollLeft > 2 };
    setOverflow((previous) => previous.left === next.left && previous.right === next.right ? previous : next);
  };
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    measure();
    return () => observer.disconnect();
  }, []);
  return <div className="relative min-w-0">
    <div ref={viewport} onScroll={measure} className={className} data-grid-viewport>{children}</div>
    <div aria-hidden className={`pointer-events-none absolute inset-y-0 left-0 z-20 w-12 bg-linear-to-r from-grid-edge to-transparent transition-opacity duration-200 motion-reduce:transition-none ${overflow.left ? 'opacity-100' : 'opacity-0'}`} />
    <div aria-hidden className={`pointer-events-none absolute inset-y-0 right-0 z-20 w-14 bg-linear-to-l from-grid-edge to-transparent transition-opacity duration-200 motion-reduce:transition-none ${overflow.right ? 'opacity-100' : 'opacity-0'}`} />
  </div>;
}
