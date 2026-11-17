import type { ComponentPropsWithRef, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { useId } from 'react';
import { NoticePresence } from './NoticePresence';

type ButtonProps = ComponentPropsWithRef<'button'> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; busy?: boolean };

export function Button({ variant = 'primary', busy, className = '', children, disabled, ...rest }: ButtonProps) {
  const styles = {
    primary: 'bg-gold text-on-gold font-semibold hover:bg-gold-hover',
    secondary: 'border border-line bg-surface-raised text-text hover:border-muted/70',
    ghost: 'text-muted hover:bg-surface-raised hover:text-text',
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

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-card border border-line bg-surface p-4 sm:p-5 ${className}`}>{children}</section>;
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string | undefined; hint?: string };

export function TextField({ label, error, hint, className = '', ...rest }: FieldProps) {
  const id = useId();
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-sm font-medium text-text">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className="min-h-11 rounded-card border border-line bg-ink px-3 text-base text-text transition-[border-color,box-shadow] duration-150 placeholder:text-muted/60 focus:border-gold focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-gold)_22%,transparent)] focus:outline-none"
        {...rest}
      />
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

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string | undefined; hint?: string };

export function TextAreaField({ label, error, hint, className = '', ...rest }: TextAreaProps) {
  const id = useId();
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-sm font-medium text-text">
        {label}
      </label>
      <textarea
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className="min-h-24 resize-y rounded-card border border-line bg-ink px-3 py-2.5 text-base text-text transition-[border-color,box-shadow] duration-150 placeholder:text-muted/60 focus:border-gold focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-gold)_22%,transparent)] focus:outline-none"
        {...rest}
      />
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

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { label: string; children: ReactNode };

export function SelectField({ label, children, className = '', ...rest }: SelectProps) {
  const id = useId();
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-sm font-medium text-text">
        {label}
      </label>
      {/* The chevron and its right padding come from the global select rule in index.css. */}
      <select
        id={id}
        className="min-h-11 w-full rounded-card border border-line bg-ink pl-3 text-base text-text transition-[border-color] duration-150 focus:border-gold focus:outline-none"
        {...rest}
      >
        {children}
      </select>
    </div>
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
        <svg aria-hidden viewBox="0 0 20 20" className="mt-0.5 size-4 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <circle cx="10" cy="10" r="8" />
          <path d="M10 9v5M10 6.25v.01" />
        </svg>
      ) : null}
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        <div>{children}</div>
      </div>
      {onDismiss ? (
        <button type="button" onClick={onDismiss} aria-label="Dismiss"
          className="-my-1.5 -mr-1.5 inline-flex size-8 shrink-0 items-center justify-center rounded-card opacity-80 hover:bg-current/10 hover:opacity-100">
          <svg aria-hidden viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="m4 4 8 8M12 4l-8 8" />
          </svg>
        </button>
      ) : null}
    </div>
  );
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

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'gold' | 'danger' | 'success' }) {
  const styles = { neutral: 'border-line text-muted', gold: 'border-gold/50 text-gold-fg', danger: 'border-danger/50 text-danger', success: 'border-success/50 bg-success/10 text-success' }[tone];
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${styles}`}>{children}</span>;
}
