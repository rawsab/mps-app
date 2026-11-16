import type { ComponentPropsWithRef, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { useId } from 'react';

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

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { label: string; children: ReactNode };

export function SelectField({ label, children, className = '', ...rest }: SelectProps) {
  const id = useId();
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-sm font-medium text-text">
        {label}
      </label>
      {/* Native arrow sits flush to the border in some browsers; draw our own with room. */}
      <div className="relative">
        <select
          id={id}
          className="min-h-11 w-full appearance-none rounded-card border border-line bg-ink pl-3 pr-10 text-base text-text transition-[border-color] duration-150 focus:border-gold focus:outline-none"
          {...rest}
        >
          {children}
        </select>
        <svg aria-hidden viewBox="0 0 16 16" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="m4 6 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}

export function Alert({ tone = 'error', title, children }: { tone?: 'error' | 'info' | 'success'; title?: string; children: ReactNode }) {
  const styles = {
    error: 'border-danger/50 bg-danger/10 text-danger',
    info: 'border-gold/40 bg-gold/10 text-text',
    success: 'border-success/50 bg-success/10 text-success',
  }[tone];
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-card border px-3 py-2.5 text-sm ${styles}`}>
      {title ? <p className="font-semibold">{title}</p> : null}
      <div>{children}</div>
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

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    // min-h-11 matches a header button, so the title doesn't shift when an action hides.
    <header className="mb-6 flex min-h-11 flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[1.75rem] font-medium leading-tight tracking-[-0.025em] text-text sm:text-[2rem]">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {actions}
    </header>
  );
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'gold' | 'danger' }) {
  const styles = { neutral: 'border-line text-muted', gold: 'border-gold/50 text-gold-fg', danger: 'border-danger/50 text-danger' }[tone];
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${styles}`}>{children}</span>;
}
