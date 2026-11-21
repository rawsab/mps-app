import { useRef, useState } from 'react';
import { ChartTooltip } from './Tooltip';

export type ColumnSlot = {
  key: string;
  /** Tooltip and table label, e.g. "3 PM" or "Week of Nov 16". */
  label: string;
  /** Axis label, or '' where the axis skips it to stay legible. */
  tick: string;
};

const plural = (n: number, one: string) => `${n.toLocaleString()} ${one}${n === 1 ? '' : 's'}`;

/**
 * Columns per time slot. One series, so no legend: the panel title names it. The tallest count
 * labels the top gridline; hovering a column shows its slot and count, and a hidden table carries
 * the same numbers for screen readers.
 */
export function ColumnTrend({ slots, counts, noun, caption, slotHeading }: {
  slots: ColumnSlot[]; counts: number[];
  /** Singular, e.g. "notification". */
  noun: string;
  /** The screen-reader table's caption and its first column's heading. */
  caption: string; slotHeading: string;
}) {
  const max = Math.max(1, ...counts);
  const [hover, setHover] = useState<number | null>(null);
  // The pointer inside the plot, so the tooltip sits just above the cursor.
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const columns = slots.map((slot, index) => ({ slot, count: counts[index] ?? 0 }));
  const hovered = hover === null ? undefined : columns[hover];

  return (
    <div className="min-w-0">
      <div className="flex gap-2">
        <div ref={plotRef} className="relative h-32 min-w-0 flex-1" onPointerLeave={() => { setHover(null); setPointer(null); }}
          onPointerMove={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            setPointer({ x: event.clientX - box.left, y: event.clientY - box.top });
          }}>
          {/* Recessive grid: the top line marks the tallest count, the baseline closes the bars. */}
          <span aria-hidden className="absolute inset-x-0 top-0 border-t border-dashed border-line" />
          <span aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-line" />
          <ul aria-hidden className="absolute inset-0 flex items-end gap-0.5">
            {columns.map(({ slot, count }, index) => (
              <li key={slot.key} onPointerEnter={() => setHover(index)} className="flex h-full min-w-0 flex-1 items-end">
                <span data-hover={hover === index || undefined}
                  className="w-full rounded-t-[3px] bg-[var(--color-chart-bar)] opacity-80 transition-[height,opacity] duration-300 data-[hover]:opacity-100 motion-reduce:transition-none"
                  style={{ height: count ? `max(2px, ${(count / max) * 100}%)` : 0 }} />
              </li>
            ))}
          </ul>
          {hovered && pointer ? (
            <ChartTooltip x={pointer.x} y={pointer.y - 10} dense>
              <span className="text-muted">{hovered.slot.label}</span>
              <span className="font-medium tabular-nums">{plural(hovered.count, noun)}</span>
            </ChartTooltip>
          ) : null}
        </div>
        <span aria-hidden className="-mt-1.5 w-6 shrink-0 text-xs tabular-nums text-muted">{max}</span>
      </div>
      <div aria-hidden className="mr-8 mt-1.5 flex gap-0.5">
        {slots.map((slot) => <span key={slot.key} className="min-w-0 flex-1 overflow-visible whitespace-nowrap text-[0.6875rem] text-muted">{slot.tick}</span>)}
      </div>
      <table className="sr-only">
        <caption>{caption}</caption>
        <thead><tr><th scope="col">{slotHeading}</th><th scope="col">{noun.charAt(0).toUpperCase() + noun.slice(1)}s</th></tr></thead>
        <tbody>{columns.map(({ slot, count }) => <tr key={slot.key}><th scope="row">{slot.label}</th><td>{count}</td></tr>)}</tbody>
      </table>
    </div>
  );
}
