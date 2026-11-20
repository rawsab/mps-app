import type { ChangeEvent, ComponentPropsWithRef, ReactNode } from 'react';

type IconButtonProps = Omit<ComponentPropsWithRef<'button'>, 'aria-label'> & {
  /** The accessible name; icon buttons have no visible text. */
  label: string;
  size?: 'sm' | 'md';
  /** Hover colour: `danger` for remove and delete. */
  tone?: 'default' | 'danger';
  /** The lift-and-press motion from `btn-motion`, for controls that sit alone (sidebar, header). */
  lift?: boolean;
};

/** A square, borderless button holding one icon: close, ⋯ menus, remove. */
export function IconButton({ label, size = 'md', tone = 'default', lift = false, type = 'button', className = '', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      className={`${lift ? 'btn-motion' : 'transition-colors'} inline-flex ${size === 'sm' ? 'size-9' : 'size-11'} shrink-0 items-center justify-center rounded-card text-muted hover:bg-surface-raised ${tone === 'danger' ? 'hover:text-danger' : 'hover:text-text'} disabled:opacity-40 ${className}`}
      {...rest}
    />
  );
}

type Option<T extends string> = { value: T; label: ReactNode; icon?: ReactNode };

/** One-of-a-few view switch in a bordered track. Use Tabs when the options swap a whole panel. */
export function SegmentedControl<T extends string>({ label, options, value, onChange, size = 'sm', optionClassName = '' }: {
  label: string; options: readonly Option<T>[]; value: T; onChange: (value: T) => void; size?: 'sm' | 'md'; optionClassName?: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex rounded-card border border-line p-0.5">
      {options.map((option) => (
        <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => onChange(option.value)}
          className={`${size === 'md' ? 'min-h-10' : 'min-h-9'} rounded-inner px-3 text-sm transition-colors ${optionClassName} ${value === option.value ? 'bg-surface-raised font-medium text-text' : 'text-muted hover:text-text'}`}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** A rounded filter or picker pill; gold-tinted while pressed. Put a row of them in a `role="group"`. */
export function Chip({ pressed, size = 'sm', className = '', type = 'button', ...rest }: ComponentPropsWithRef<'button'> & { pressed: boolean; size?: 'sm' | 'md' }) {
  return (
    <button type={type} aria-pressed={pressed}
      className={`${size === 'md' ? 'min-h-11 px-4' : 'min-h-9 px-3'} rounded-full border text-sm transition-colors ${pressed ? 'border-gold/50 bg-gold/10 font-medium text-gold-fg' : 'border-line text-muted hover:bg-surface-raised hover:text-text'} ${className}`}
      {...rest} />
  );
}

/** An on/off choice that fills gold when on (weekdays, services). Set horizontal padding with `className`. */
export function ToggleButton({ pressed, className = '', type = 'button', ...rest }: ComponentPropsWithRef<'button'> & { pressed: boolean }) {
  return (
    <button type={type} aria-pressed={pressed}
      className={`min-h-11 rounded-card border text-sm transition-colors ${pressed ? 'border-gold bg-gold font-semibold text-on-gold' : 'border-line text-muted hover:bg-surface-raised hover:text-text'} ${className}`}
      {...rest} />
  );
}

/**
 * Underlined tabs over one panel. Give the panel `id={panelId}`, `role="tabpanel"` and
 * `aria-labelledby={`${idPrefix}-${value}`}`. Arrow keys, Home and End move between tabs.
 */
export function Tabs<T extends string>({ label, options, value, onChange, idPrefix, panelId, className = '' }: {
  label: string; options: readonly Option<T>[]; value: T; onChange: (value: T) => void; idPrefix: string; panelId: string; className?: string;
}) {
  return (
    <div role="tablist" aria-label={label} className={`flex gap-1 border-b border-line ${className}`}>
      {options.map((option, index) => (
        <button
          key={option.value}
          role="tab"
          type="button"
          id={`${idPrefix}-${option.value}`}
          tabIndex={value === option.value ? 0 : -1}
          aria-selected={value === option.value}
          aria-controls={panelId}
          onKeyDown={(event) => {
            const last = options.length - 1;
            const next = { ArrowLeft: index === 0 ? last : index - 1, ArrowRight: index === last ? 0 : index + 1, Home: 0, End: last }[event.key];
            if (next === undefined) return;
            event.preventDefault();
            onChange(options[next]!.value);
            document.getElementById(`${idPrefix}-${options[next]!.value}`)?.focus();
          }}
          // Commit a focused field during click, so a banner it raises cannot move this tab
          // between pointer-down and click and swallow the switch.
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.currentTarget.focus();
            onChange(option.value);
          }}
          className={`-mb-px inline-flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm ${value === option.value ? 'border-gold font-medium text-text' : 'border-transparent text-muted hover:text-text'}`}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** A muted, inline checkbox for view options ("Hide cancelled"). */
export function Checkbox({ label, checked, onChange, className = '' }: {
  label: ReactNode; checked: boolean; onChange: (event: ChangeEvent<HTMLInputElement>) => void; className?: string;
}) {
  return (
    <label className={`flex min-h-11 cursor-pointer items-center gap-2 text-sm text-muted ${className}`}>
      <input type="checkbox" className="size-4 accent-gold" checked={checked} onChange={onChange} />
      {label}
    </label>
  );
}
