import { useId, type ReactNode } from 'react';

/** A small "i" button that shows `children` on hover or focus, for a one-line explanation beside a heading. */
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const tooltipId = useId();
  return (
    <span className="group/info-tip relative inline-flex">
      <button type="button" aria-label={label} aria-describedby={tooltipId} className="inline-flex size-4 items-center justify-center rounded-full border border-muted/60 text-[10px] font-semibold leading-none text-muted outline-none transition-colors hover:border-gold hover:text-text focus-visible:border-gold focus-visible:text-text">i</button>
      <span id={tooltipId} role="tooltip" className="invisible pointer-events-none absolute left-1/2 top-full z-30 mt-2 w-max max-w-52 -translate-x-1/2 rounded-card border border-line bg-surface-raised px-2.5 py-1.5 text-xs font-normal leading-4 text-text opacity-0 shadow-lg transition-opacity duration-150 group-hover/info-tip:visible group-hover/info-tip:opacity-100 group-focus-within/info-tip:visible group-focus-within/info-tip:opacity-100">{children}</span>
    </span>
  );
}

/**
 * The hover readout on a chart, centred above (`x`, `y`) in the chart's positioned container.
 * Decorative: charts also render their values as an sr-only table or labels. `dense` drops the gap
 * between lines.
 */
export function ChartTooltip({ x, y, dense = false, children }: { x: number; y: number; dense?: boolean; children: ReactNode }) {
  return (
    <span aria-hidden style={{ left: x, top: y }}
      className={`pointer-events-none absolute z-10 flex -translate-x-1/2 -translate-y-full flex-col items-center whitespace-nowrap rounded-card border border-line bg-surface-raised px-2 text-xs shadow-lg ${dense ? 'py-1' : 'gap-1 py-1.5'}`}>
      {children}
    </span>
  );
}
