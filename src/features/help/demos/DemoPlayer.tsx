import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { IconButton } from '@/components/controls';
import { PauseIcon, PlayIcon } from '@/components/icons';
import { Kbd } from '@/components/ui';
import { demoSteps, type DemoScript } from '@/domain/help/demo';

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Plays while at least this much of the demo is on screen. */
const IN_VIEW_RATIO = 0.4;

/**
 * Plays a demo script in a loop on the black and gold backdrop (decision 0057, phase 2). It runs
 * only while on screen and the tab is visible, and Pause stops it (WCAG 2.2.2). With reduced motion
 * it opens on the last frame, paused, until Play is pressed. The picture is inert and hidden from
 * screen readers, which get the description and the list of steps instead.
 */
export function DemoPlayer<S>({ script, render }: { script: DemoScript<S>; render: (state: S) => ReactNode }) {
  const last = script.frames.length - 1;
  const [index, setIndex] = useState(() => (reducedMotion() ? last : 0));
  const [wantsPlay, setWantsPlay] = useState(() => !reducedMotion());
  const [inView, setInView] = useState(false);
  const [tabVisible, setTabVisible] = useState(() => typeof document === 'undefined' || !document.hidden);
  const frame = script.frames[index]!;
  const running = wantsPlay && inView && tabVisible;

  const figure = useRef<HTMLElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ scale: 1, left: 0, height: 0 });
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => setIndex((i) => (i + 1) % script.frames.length), frame.ms);
    return () => window.clearTimeout(timer);
  }, [running, index, frame.ms, script.frames.length]);

  useEffect(() => {
    const el = figure.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setInView(!!entry && entry.intersectionRatio >= IN_VIEW_RATIO), { threshold: [0, IN_VIEW_RATIO, 1] });
    observer.observe(el);
    const onVisibility = () => setTabVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', onVisibility); };
  }, []);

  // The picture keeps its own size and scales down to fit narrow screens, so the pointer's
  // positions stay right at any width.
  useLayoutEffect(() => {
    const outer = box.current;
    const inner = stage.current;
    if (!outer || !inner) return;
    const measure = () => {
      const scale = Math.min(1, outer.clientWidth / inner.offsetWidth);
      setFit({ scale, left: (outer.clientWidth - inner.offsetWidth * scale) / 2, height: inner.offsetHeight * scale });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(outer);
    observer.observe(inner);
    return () => observer.disconnect();
  }, []);

  // Point at the frame's target, measured in the stage's own (unscaled) coordinates.
  useLayoutEffect(() => {
    const inner = stage.current;
    const target = frame.pointer ? inner?.querySelector<HTMLElement>(`[data-demo-target="${CSS.escape(frame.pointer.target)}"]`) : null;
    if (!inner || !target) {
      setPointer(null);
      return;
    }
    const from = inner.getBoundingClientRect();
    const rect = target.getBoundingClientRect();
    const scale = fit.scale || 1;
    setPointer({ x: (rect.left - from.left + Math.min(28, rect.width / 2)) / scale, y: (rect.top - from.top + rect.height * 0.6) / scale });
  }, [frame, fit.scale]);

  const steps = demoSteps(script);
  const toggle = () => {
    // Play after a paused last frame starts again from the top.
    if (!wantsPlay && index === last) setIndex(0);
    setWantsPlay(!wantsPlay);
  };

  return (
    <figure ref={figure} className="my-6">
      <div className="help-demo relative overflow-hidden rounded-card border border-line px-4 pb-14 pt-12 sm:px-8">
        <IconButton label={wantsPlay ? 'Pause animation' : 'Play animation'} size="sm" onClick={toggle} className="absolute right-2 top-2">
          {wantsPlay ? <PauseIcon /> : <PlayIcon />}
        </IconButton>
        <div ref={box} aria-hidden className="relative" style={{ height: fit.height || undefined }}>
          <div ref={stage} inert className="absolute top-0 w-max origin-top-left" style={{ left: fit.left, transform: `scale(${fit.scale})` }}>
            {render(frame.state)}
            {frame.keys?.length ? (
              <span className="absolute left-0 top-full mt-3 flex gap-1.5 rounded-card bg-surface px-2 py-1 text-xs text-muted shadow-popover">
                {frame.keys.map((key) => <Kbd key={key}>{key}</Kbd>)}
              </span>
            ) : null}
            {pointer ? <DemoCursor x={pointer.x} y={pointer.y} press={!!frame.pointer?.press} /> : null}
          </div>
        </div>
      </div>
      <figcaption className="mt-2 text-sm text-muted">
        <span aria-hidden className="block min-h-5">{frame.caption}</span>
        <span className="sr-only">
          Animation: {script.description} Steps:
          <ol>{steps.map((step) => <li key={step}>{step}</li>)}</ol>
        </span>
      </figcaption>
    </figure>
  );
}

/** An arrow pointer that glides between targets and dips with a gold ring when pressed. */
function DemoCursor({ x, y, press }: { x: number; y: number; press: boolean }) {
  return (
    <span className="help-demo-cursor pointer-events-none absolute z-10" style={{ left: x, top: y }}>
      <span className={`absolute -left-3 -top-3 size-6 rounded-full border-2 border-gold transition-[opacity,transform] duration-150 ${press ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`} />
      <svg viewBox="0 0 16 20" className={`relative size-5 drop-shadow transition-transform duration-150 ${press ? 'scale-90' : ''}`}>
        <path d="M1 1v15.5l4.2-4 2.9 6.6 2.6-1.1-2.8-6.5H14z" fill="var(--color-text)" stroke="var(--color-ink)" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
