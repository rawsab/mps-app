import { useId, useState, type ReactNode } from 'react';
import { ChevronIcon } from './icons';

/**
 * Intrinsic-height expansion keeps async content responsive and supports reversing mid-transition.
 * `heading` wraps the trigger in a heading element; `meta` sits at the trailing edge (e.g. "3 of 5 rated").
 */
export function AnimatedDisclosure({ label, meta, heading, size = 'lg', children, className = '' }: {
  label: ReactNode; meta?: ReactNode; heading?: 'h2' | 'h3'; size?: 'md' | 'lg'; children: ReactNode; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const trigger = (
    <button type="button" id={`${id}-trigger`} aria-expanded={open} aria-controls={`${id}-content`}
      onClick={() => setOpen((value) => !value)}
      className={`flex min-h-11 w-full items-center gap-2 text-left font-semibold ${size === 'lg' ? 'py-2 text-lg' : 'py-3'}`}>
      <span className="inline-flex text-muted"><ChevronIcon open={open} /></span>
      {meta ? <><span className="flex-1">{label}</span>{meta}</> : label}
    </button>
  );
  const Heading = heading;
  return <section aria-labelledby={heading ? `${id}-trigger` : undefined} className={className}>
    {Heading ? <Heading>{trigger}</Heading> : trigger}
    <div id={`${id}-content`} role="region" aria-labelledby={`${id}-trigger`} aria-hidden={!open} inert={!open}
      data-open={open} className="animated-disclosure-content">
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  </section>;
}
