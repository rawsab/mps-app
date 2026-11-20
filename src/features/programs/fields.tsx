import { useEffect, useId, useState, type ReactNode } from 'react';
import type { DraftCommand } from '@/domain/programs/commands';
import { planEdits, type GridColumnKey } from '@/domain/programs/grid';
import { useEditor } from './useDraftEditor';
import { useMuscleSuggestions } from './MuscleSuggestions';
import { controlClass, RequiredMark } from '@/components/ui';

/** Shared key for a rejected edit, so the Program and Grid views show the same kept text. */
export const cellKey = (exerciseId: string, column: GridColumnKey) => `${exerciseId}:${column}`;

/** Commits one exercise cell through the grid model: identical parsing and messages in both views. */
export function useCellCommit() {
  const editor = useEditor();
  return (exerciseId: string, column: GridColumnKey, text: string): string | null => {
    // A mode/value/unit can be incomplete on its own. Keep the refused choice until
    // the dependent cell completes it; apply that combination as one validated edit.
    const family: GridColumnKey[] = ['loadMode', 'load', 'unit'].includes(column)
      ? ['loadMode', 'load', 'unit'] : ['effort', 'perSide'].includes(column) ? ['effort', 'perSide'] : [];
    const buffered = family.filter((key) => key !== column && editor.state.rejected[cellKey(exerciseId, key)])
      .map((key) => ({ exerciseId, column: key, text: editor.state.rejected[cellKey(exerciseId, key)]!.text }));
    const edits = [...buffered, { exerciseId, column, text }];
    const plan = planEdits(editor.draft, edits);
    if (plan.errors.length > 0) return plan.errors[0]!.message;
    const error = editor.dispatch(plan.commands);
    if (!error) edits.forEach((edit) => editor.setRejected(cellKey(exerciseId, edit.column), null));
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
  `w-full min-h-11 px-3 sm:text-sm ${controlClass}`;

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
  suggest,
  required,
}: {
  label: string;
  value: string;
  rejectKey: string;
  onCommit: (text: string) => string | null;
  /** Comma-separated autocomplete (muscle names), single-line fields only. */
  suggest?: readonly string[];
  multiline?: boolean;
  hideLabel?: boolean;
  placeholder?: string;
  hint?: ReactNode;
  type?: 'text' | 'date' | 'url';
  inputMode?: 'text' | 'decimal' | 'url';
  className?: string;
  inputClassName?: string;
  /** Required to publish: an asterisk and `aria-required`; drafts still save without it. */
  required?: boolean;
}) {
  const id = useId();
  const editor = useEditor();
  const rejected = editor.state.rejected[rejectKey];
  const [text, setText] = useState(rejected?.text ?? value);
  const [focused, setFocused] = useState(false);
  const suggestions = useMuscleSuggestions(focused && suggest ? suggest : [], text, setText, `${id}-suggestions`);

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
    'data-edit-key': rejectKey,
    value: text,
    placeholder,
    'aria-required': required || undefined,
    'aria-invalid': rejected ? true : undefined,
    'aria-describedby': [rejected ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(' ') || undefined,
    onFocus: () => setFocused(true),
    onBlur: () => {
      setFocused(false);
      commit();
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (!multiline && suggestions.onKeyDown(e as React.KeyboardEvent<HTMLInputElement>)) return;
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
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'text-sm font-medium text-text'}>
        {label}
        {required ? <RequiredMark /> : null}
      </label>
      {multiline ? (
        <textarea {...shared} rows={2} onChange={(e) => setText(e.target.value)} className={`${inputClass} ${border} min-h-16 resize-y py-2 ${inputClassName}`} />
      ) : (
        <div className="relative">
          <input {...shared} {...(suggest ? suggestions.inputProps : {})} type={type} data-empty={type === 'date' && text === '' ? true : undefined} inputMode={inputMode}
            onChange={(e) => { suggestions.onTextChange(); setText(e.target.value); }} className={`${inputClass} ${border} ${inputClassName}`} />
          {suggest ? suggestions.list : null}
        </div>
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
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'text-sm font-medium text-text'}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => setError(onCommit(e.target.value))}
        className={`${inputClass} ${error ? 'border-danger' : 'border-line'}`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error ? <p id={`${id}-error`} className="text-xs text-danger">{error}</p> : null}
    </div>
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
