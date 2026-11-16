import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

/** `label` is the plain text (button summary, accessible name); `display` optionally renders it, e.g. as a pill. */
type Option<T extends string> = { value: T; label: string; display?: ReactNode; count?: number };

type Props<T extends string> = {
  label: string;
  options: Option<T>[];
  selected: T[];
  onChange: (next: T[]) => void;
  /** Shown in the panel under the options, e.g. how multiple selections combine. */
  hint?: ReactNode;
};

/**
 * Notion-style filter: a button naming the current selection, opening a checkbox panel.
 * Closes on Escape (focus returns to the button) and on a click outside.
 */
export function MultiSelectFilter<T extends string>({ label, options, selected, onChange, hint }: Props<T>) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = (value: T) =>
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : options.map((o) => o.value).filter((v) => v === value || selected.includes(v)));

  const summary =
    selected.length === 0
      ? 'Any'
      : selected.length <= 2
        ? options.filter((o) => selected.includes(o.value)).map((o) => o.label).join(', ')
        : `${selected.length} selected`;

  return (
    // Below sm the panel anchors to the parent filter row (which must be `relative`), so it opens
    // from the row's left edge and can never run off a narrow screen; from sm up, under its button.
    <div ref={root} className="flex flex-col gap-1 sm:relative">
      <span className="text-xs font-medium text-muted">{label}</span>
      <button
        ref={button}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`${label}: ${summary}`}
        onClick={() => setOpen((o) => !o)}
        className={`btn-motion flex min-h-10 max-w-64 items-center gap-2 rounded-card border bg-surface px-3 text-sm ${
          selected.length ? 'border-gold/60 text-text' : 'border-line text-muted'
        } hover:border-muted/70`}
      >
        <span className="truncate">{summary}</span>
        {selected.length ? (
          <span className="rounded-full bg-gold/15 px-1.5 text-xs font-medium text-gold-fg">{selected.length}</span>
        ) : null}
        <svg aria-hidden viewBox="0 0 16 16" className={`ml-auto size-4 shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="m4 6 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open ? (
        <div
          id={panelId}
          role="group"
          aria-label={label}
          className="filter-panel absolute left-0 top-full z-20 mt-1.5 w-64 max-w-[calc(100vw-2rem)] rounded-card border border-line bg-surface p-1.5 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.35)]"
        >
          {options.map((o) => (
            <label
              key={o.value}
              className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[5px] px-2.5 text-sm text-text hover:bg-surface-raised sm:min-h-9"
            >
              <input type="checkbox" className="size-4 accent-gold" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} />
              <span className="flex-1">{o.display ?? o.label}</span>
              {o.count !== undefined ? <span className="text-xs tabular-nums text-muted">{o.count}</span> : null}
            </label>
          ))}
          <div className="mt-1 flex items-center justify-between gap-2 border-t border-line px-2.5 pt-1.5">
            {hint ? <p className="text-xs text-muted">{hint}</p> : <span />}
            <button
              type="button"
              disabled={selected.length === 0}
              onClick={() => onChange([])}
              className="min-h-9 shrink-0 rounded-[5px] px-2 text-xs text-muted hover:text-text disabled:opacity-40"
            >
              Clear
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
