import { useEffect, useId, useMemo, useRef, useState } from 'react';

type Option = { value: string; label: string; detail?: string };

type Props = {
  label: string;
  /** Submitted through a hidden input so the field works inside a plain <form>. */
  name: string;
  options: Option[];
  defaultValue?: string;
  hint?: string;
  error?: string | undefined;
};

const normalize = (s: string) => s.toLowerCase().replace(/[_/]+/g, ' ');

/**
 * Searchable single select (ARIA 1.2 combobox with a listbox popup). Typing filters by label;
 * arrows move, Enter picks, Escape restores the current value. Free text is never submitted:
 * leaving the field without picking keeps the previous value.
 */
export function ComboboxField({ label, name, options, defaultValue = '', hint, error }: Props) {
  const id = useId();
  const listId = `${id}-list`;
  const [value, setValue] = useState(defaultValue);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    return q ? options.filter((o) => normalize(o.label).includes(q)) : options;
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  useEffect(() => {
    if (open) list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  function openList() {
    setQuery('');
    // Start on the current value so arrows continue from it.
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  }

  function pick(option: Option) {
    setValue(option.value);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) return openList();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => Math.min(Math.max(i + step, 0), filtered.length - 1));
    } else if (e.key === 'Enter' && open) {
      e.preventDefault();
      const option = filtered[active];
      if (option) pick(option);
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      setOpen(false);
    }
  }

  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(' ') || undefined;
  const activeOption = open ? filtered[active] : undefined;

  return (
    <div ref={root} className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-text">
        {label}
      </label>
      <input type="hidden" name={name} value={value} />
      <div className="relative">
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeOption ? `${id}-opt-${activeOption.value}` : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          autoComplete="off"
          spellCheck={false}
          value={open ? query : value}
          placeholder={open ? value || 'Search' : undefined}
          onFocus={openList}
          onClick={() => !open && openList()}
          onBlur={(e) => {
            if (!root.current?.contains(e.relatedTarget as Node)) setOpen(false);
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          className="min-h-11 w-full rounded-card border border-line bg-ink pl-3 pr-9 text-base text-text transition-[border-color,box-shadow] duration-150 placeholder:text-muted/60 focus:border-gold focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-gold)_22%,transparent)] focus:outline-none"
        />
        <svg aria-hidden viewBox="0 0 16 16" className={`pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted transition-transform duration-150 ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="m4 6 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      {open ? (
        <ul
          ref={list}
          id={listId}
          role="listbox"
          aria-label={label}
          className="filter-panel absolute left-0 right-0 top-full z-20 mt-1.5 max-h-64 overflow-y-auto rounded-card border border-line bg-surface p-1.5 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.35)]"
        >
          {filtered.length === 0 ? <li className="px-2.5 py-2 text-sm text-muted">No matches</li> : null}
          {filtered.map((o, i) => (
            <li
              key={o.value}
              id={`${id}-opt-${o.value}`}
              role="option"
              aria-selected={o.value === value}
              data-index={i}
              // Keep focus in the input so the click doesn't blur-close the list first.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(o)}
              onMouseMove={() => setActive(i)}
              className={`flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-[5px] px-2.5 text-sm sm:min-h-9 ${
                i === active ? 'bg-surface-raised text-text' : 'text-text'
              } ${o.value === value ? 'font-medium text-gold-fg' : ''}`}
            >
              <span className="truncate">{o.label}</span>
              {o.detail ? <span className="shrink-0 text-xs tabular-nums text-muted">{o.detail}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      </div>
      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
