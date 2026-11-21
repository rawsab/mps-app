import type { ComponentPropsWithRef, InputHTMLAttributes, ReactNode, Ref, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { useId } from 'react';
import { CloseIcon, InfoIcon } from './icons';
import { NoticePresence } from './NoticePresence';

type ButtonProps = ComponentPropsWithRef<'button'> & { variant?: 'primary' | 'secondary' | 'ghost' | 'ghost-danger' | 'ghost-gold' | 'danger'; busy?: boolean };

export function Button({ variant = 'primary', busy, className = '', children, disabled, ...rest }: ButtonProps) {
  const styles = {
    primary: 'bg-gold text-on-gold font-semibold hover:bg-gold-hover',
    secondary: 'border border-line bg-surface-raised text-text hover:border-muted/70',
    ghost: 'text-muted hover:bg-surface-raised hover:text-text',
    // Text only, for a destructive action beside ghost buttons.
    'ghost-danger': 'text-danger hover:bg-danger/10',
    // Text only, for an action inside a gold-tinted panel.
    'ghost-gold': 'text-gold-fg hover:bg-gold/10',
    danger: 'border border-danger/50 bg-surface-raised text-danger hover:border-danger',
  }[variant];
  return (
    <button
      className={`btn-motion inline-flex min-h-11 items-center justify-center gap-2 rounded-card px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {busy ? <Spinner small /> : null}
      {children}
    </button>
  );
}

/**
 * A bordered surface. `sm` padding for a compact card inside a list or sidebar. `fill="page"` leaves
 * the page background showing, for outlined cards that sit directly on the page.
 */
export function Card({ children, className = '', padding = 'md', fill = 'surface', as: Tag = 'section' }: {
  children: ReactNode; className?: string; padding?: 'sm' | 'md'; fill?: 'surface' | 'page'; as?: 'section' | 'div' | 'dl';
}) {
  return <Tag className={`rounded-card border border-line ${fill === 'surface' ? 'bg-surface' : ''} ${padding === 'sm' ? 'p-4' : 'p-4 sm:p-5'} ${className}`}>{children}</Tag>;
}

/** The look shared by every text control: ink fill, gold border and ring on focus. Add height, padding and a border colour. */
export const controlClass = 'rounded-card border bg-ink text-base text-text transition-[border-color,box-shadow] duration-150 placeholder:text-muted/60 focus:border-gold focus:shadow-focus focus:outline-none';

type FieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string | undefined; hint?: string };

/** Marks a label whose field is required to publish. Fields use `aria-required`, not `required`, so incomplete drafts still autosave. */
export function RequiredMark() {
  return <span aria-hidden className="ml-0.5 text-muted">*</span>;
}

/** The legend for `RequiredMark`, once per form. */
export function RequiredNote({ className = '' }: { className?: string }) {
  return <p className={`text-xs text-muted ${className}`}>* Required to publish</p>;
}

/** `aria-describedby` for a control inside a FieldShell. */
export function fieldDescription(id: string, error?: string, hint?: ReactNode) {
  return [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(' ') || undefined;
}

/** Label, hint and error around one control. Give the control `id` and `aria-describedby={fieldDescription(…)}`. */
export function FieldShell({ id, label, required, hint, error, className = '', ref, children }: {
  id: string; label: ReactNode; required?: boolean | undefined; hint?: ReactNode; error?: string | undefined; className?: string; ref?: Ref<HTMLDivElement>; children: ReactNode;
}) {
  return (
    <div ref={ref} className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-sm font-medium text-text">
        {label}
        {required ? <RequiredMark /> : null}
      </label>
      {children}
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

export function TextField({ label, error, hint, className = '', required, ...rest }: FieldProps) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} required={required} hint={hint} error={error} className={className}>
      <input
        id={id}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={fieldDescription(id, error, hint)}
        className={`min-h-11 border-line px-3 ${controlClass}`}
        {...rest}
      />
    </FieldShell>
  );
}

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string | undefined; hint?: string };

export function TextAreaField({ label, error, hint, className = '', ...rest }: TextAreaProps) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} className={className}>
      <textarea
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={fieldDescription(id, error, hint)}
        className={`min-h-24 resize-y border-line px-3 py-2.5 ${controlClass}`}
        {...rest}
      />
    </FieldShell>
  );
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string | undefined; hint?: string; children: ReactNode };

export function SelectField({ label, error, hint, children, className = '', required, ...rest }: SelectProps) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} required={required} hint={hint} error={error} className={className}>
      {/* The chevron and its right padding come from the global select rule in index.css. */}
      <select
        id={id}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={fieldDescription(id, error, hint)}
        className="min-h-11 w-full rounded-card border border-line bg-ink pl-3 text-base text-text transition-[border-color] duration-150 focus:border-gold focus:outline-none"
        {...rest}
      >
        {children}
      </select>
    </FieldShell>
  );
}

type AlertProps = { tone?: 'error' | 'info' | 'note' | 'success'; title?: string; children: ReactNode; onDismiss?: () => void; visible?: boolean; className?: string };

/** Keep conditional alerts mounted with `visible` so cleared messages can animate out. */
export function Alert({ visible = true, className, ...props }: AlertProps) {
  return <NoticePresence visible={visible} className={className}><AlertBody {...props} /></NoticePresence>;
}

function AlertBody({ tone = 'error', title, children, onDismiss }: AlertProps) {
  const styles = {
    error: 'border-danger/50 bg-danger/10 text-danger',
    info: 'border-gold/40 bg-gold/10 text-text',
    // Grey, for context that needs no action.
    note: 'border-line bg-surface-raised text-text',
    success: 'border-success/50 bg-success/10 text-success',
  }[tone];
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex items-start gap-2 rounded-card border px-3 py-2.5 text-sm ${styles}`}>
      {tone === 'note' ? (
        <InfoIcon className="mt-0.5 size-4 shrink-0 text-muted" />
      ) : null}
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        <div>{children}</div>
      </div>
      {onDismiss ? (
        <button type="button" onClick={onDismiss} aria-label="Dismiss"
          className="-my-1.5 -mr-1.5 inline-flex size-8 shrink-0 items-center justify-center rounded-card opacity-80 hover:bg-current/10 hover:opacity-100">
          <CloseIcon />
        </button>
      ) : null}
    </div>
  );
}

/** A placeholder block in the shape of content that's still loading; size and round it with `className`. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <span aria-hidden className={`block animate-pulse rounded-card bg-surface-raised motion-reduce:animate-none ${className}`} />;
}

export function Spinner({ small, label }: { small?: boolean; label?: string }) {
  return (
    <span role={label ? 'status' : undefined} className="inline-flex items-center gap-2 text-muted">
      <span
        aria-hidden
        className={`${small ? 'size-4' : 'size-6'} animate-spin rounded-full border-2 border-current border-t-transparent`}
      />
      {label ? <span className="text-sm">{label}</span> : null}
    </span>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <Card className="flex flex-col items-start gap-2">
      <h2 className="text-base font-semibold text-text">{title}</h2>
      {children ? <div className="text-sm text-muted">{children}</div> : null}
      {action}
    </Card>
  );
}

export function PageHeader({ title, subtitle, actions, leading }: { title: string; subtitle?: ReactNode; actions?: ReactNode; leading?: ReactNode }) {
  return (
    // min-h-11 matches a header button, so the title doesn't shift when an action hides.
    <header className="mb-6 flex min-h-11 flex-wrap items-end justify-between gap-3">
      <div className="flex min-w-0 items-center gap-4">
        {leading}
        <div className="min-w-0">
          <h1 className="break-words text-[1.75rem] font-medium leading-tight tracking-[-0.025em] text-text sm:text-[2rem]">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
        </div>
      </div>
      {actions}
    </header>
  );
}

const BADGE_STYLES = {
  neutral: 'border-line text-muted',
  gold: 'border-gold/50 text-gold-fg',
  danger: 'border-danger/50 text-danger',
  success: 'border-success/50 bg-success/10 text-success',
  info: 'border-info/50 bg-info/10 text-info',
  violet: 'border-violet/50 bg-violet/10 text-violet',
  // Filled, for kind labels on rows (Section, Exercise).
  raised: 'border-line bg-surface-raised text-muted',
  'gold-soft': 'border-gold/25 bg-gold/10 text-gold-fg',
};

export type BadgeTone = keyof typeof BADGE_STYLES;

/** A key hint ("⌘K", "esc"); hidden from screen readers, so pair it with `aria-keyshortcuts`. */
export function Kbd({ children }: { children: ReactNode }) {
  return <kbd aria-hidden className="rounded-[4px] border border-line px-1.5 font-sans text-[11px] leading-5 text-muted">{children}</kbd>;
}

/** `sm` is the compact label beside a heading. */
export function Badge({ children, tone = 'neutral', size = 'md', className = '' }: { children: ReactNode; tone?: BadgeTone; size?: 'sm' | 'md'; className?: string }) {
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 ${size === 'sm' ? 'text-[11px] font-medium leading-4' : 'text-xs'} ${BADGE_STYLES[tone]} ${className}`}>{children}</span>;
}

/** A page section's h2: gold icon, then the title. Add spacing with `className`. */
export function SectionHeading({ id, icon, children, className = '' }: { id?: string; icon: ReactNode; children: ReactNode; className?: string }) {
  return <h2 id={id} className={`flex items-center gap-2 text-lg font-semibold ${className}`}><SectionTitle icon={icon}>{children}</SectionTitle></h2>;
}

/** A section heading's icon and text; put it inside an h2 with `flex items-center gap-2`, or use SectionHeading. */
export function SectionTitle({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return <><span aria-hidden className="inline-flex shrink-0 text-gold-fg">{icon}</span><span className="min-w-0">{children}</span></>;
}
