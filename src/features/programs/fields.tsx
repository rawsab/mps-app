import { useEffect, useId, useState, type ReactNode } from 'react';
import type { DraftCommand } from '@/domain/programs/commands';
import { planEdits, type GridColumnKey } from '@/domain/programs/grid';
import { useEditor } from './useDraftEditor';

/** Shared key for a rejected edit, so the Program and Grid views show the same kept text. */
export const cellKey = (exerciseId: string, column: GridColumnKey) => `${exerciseId}:${column}`;

/** Commits one exercise cell through the grid model: identical parsing and messages in both views. */
export function useCellCommit() {
  const editor = useEditor();
  return (exerciseId: string, column: GridColumnKey, text: string): string | null => {
    const plan = planEdits(editor.draft, [{ exerciseId, column, text }]);
    if (plan.errors.length > 0) return plan.errors[0]!.message;
    const error = editor.dispatch(plan.commands);
    return error ? error.message : null;
  };
}

/** Dispatches one command and turns a contract error into a short field message. */
export function useCommandCommit() {
  const editor = useEditor();
  return (command: DraftCommand): string | null => {
    const error = editor.dispatch([command]);
    return error ? error.message : null;
  };
}

const inputClass =
  'w-full min-h-11 rounded-card border bg-ink px-3 text-base text-text transition-[border-color,box-shadow] duration-150 placeholder:text-muted/60 focus:border-gold focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-gold)_22%,transparent)] focus:outline-none sm:text-sm';

/**
 * A text field that commits on blur or Enter. Refused text stays in the field with its message,
 * held in the editor (not this component), so it survives switching views. Escape reverts.
 */
export function CommitField({
  label,
  value,
  rejectKey,
  onCommit,
  multiline,
  hideLabel,
  placeholder,
  hint,
  type = 'text',
  inputMode,
  className = '',
  inputClassName = '',
}: {
  label: string;
  value: string;
  rejectKey: string;
  onCommit: (text: string) => string | null;
  multiline?: boolean;
  hideLabel?: boolean;
  placeholder?: string;
  hint?: ReactNode;
  type?: 'text' | 'date' | 'url';
  inputMode?: 'text' | 'decimal' | 'url';
  className?: string;
  inputClassName?: string;
}) {
  const id = useId();
  const editor = useEditor();
  const rejected = editor.state.rejected[rejectKey];
  const [text, setText] = useState(rejected?.text ?? value);
  const [focused, setFocused] = useState(false);

  // Follow the draft (another view, a replayed conflict, undo) unless the coach is typing here.
  useEffect(() => {
    if (!focused) setText(rejected?.text ?? value);
  }, [value, rejected?.text, focused]);

  const commit = () => {
    if (text === value) {
      editor.setRejected(rejectKey, null);
      return;
    }
    const message = onCommit(text);
    editor.setRejected(rejectKey, message ? { text, message } : null);
  };

  const shared = {
    id,
    value: text,
    placeholder,
    'aria-invalid': rejected ? true : undefined,
    'aria-describedby': [rejected ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(' ') || undefined,
    onFocus: () => setFocused(true),
    onBlur: () => {
      setFocused(false);
      commit();
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (e.key === 'Escape') {
        setText(value);
        editor.setRejected(rejectKey, null);
      } else if (e.key === 'Enter' && !multiline) {
        commit();
      }
    },
  };
  const border = rejected ? 'border-danger' : 'border-line';

  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className}`}>
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'text-xs font-medium text-muted'}>
        {label}
      </label>
      {multiline ? (
        <textarea {...shared} rows={2} onChange={(e) => setText(e.target.value)} className={`${inputClass} ${border} min-h-16 resize-y py-2 ${inputClassName}`} />
      ) : (
        <input {...shared} type={type} inputMode={inputMode} onChange={(e) => setText(e.target.value)} className={`${inputClass} ${border} ${inputClassName}`} />
      )}
      {hint && !rejected ? (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {rejected ? (
        <p id={`${id}-error`} className="text-xs text-danger">
          {rejected.message}
        </p>
      ) : null}
    </div>
  );
}

/** A select that commits on change. */
export function CommitSelect({
  label,
  value,
  options,
  onCommit,
  hideLabel,
  className = '',
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onCommit: (value: string) => string | null;
  hideLabel?: boolean;
  className?: string;
}) {
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className}`}>
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'text-xs font-medium text-muted'}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        aria-invalid={error ? true : undefined}
        onChange={(e) => setError(onCommit(e.target.value))}
        className={`${inputClass} ${error ? 'border-danger' : 'border-line'} pr-2`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}

/** Small square icon button for row actions; always labelled for screen readers. */
export function IconButton({ label, onClick, children, disabled, tone = 'default' }: { label: string; onClick: () => void; children: ReactNode; disabled?: boolean; tone?: 'default' | 'danger' }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`btn-motion inline-flex size-11 shrink-0 items-center justify-center rounded-card text-muted hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-35 sm:size-9 ${tone === 'danger' ? 'hover:text-danger' : 'hover:text-text'}`}
    >
      {children}
    </button>
  );
}

const glyph = (d: string) => (
  <svg aria-hidden viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

export const UpGlyph = () => glyph('M8 13V3m-4 4 4-4 4 4');
export const DownGlyph = () => glyph('M8 3v10m-4-4 4 4 4-4');
export const CopyGlyph = () => glyph('M5.5 5.5V3.5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2M3.5 5.5h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1Z');
export const RemoveGlyph = () => glyph('M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5');
