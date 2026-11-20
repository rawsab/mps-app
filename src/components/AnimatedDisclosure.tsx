import { useId, useState, type ReactNode } from 'react';
import { ChevronIcon } from './icons';

/** Intrinsic-height expansion keeps async content responsive and supports reversing mid-transition. */
export function AnimatedDisclosure({ label, children, className = '' }: { label: ReactNode; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <section className={className}>
    <button type="button" id={`${id}-trigger`} aria-expanded={open} aria-controls={`${id}-content`}
      onClick={() => setOpen((value) => !value)}
      className="flex min-h-11 w-full items-center gap-2 py-2 text-left text-lg font-semibold">
      <span className="inline-flex text-muted"><ChevronIcon open={open} /></span>{label}
    </button>
    <div id={`${id}-content`} role="region" aria-labelledby={`${id}-trigger`} aria-hidden={!open} inert={!open}
      data-open={open} className="animated-disclosure-content">
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  </section>;
}
