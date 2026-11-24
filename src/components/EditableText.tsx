import { useRef, useState } from 'react';
import { IconButton } from './controls';
import { PencilIcon } from './icons';

/**
 * A heading's text with a faint pencil beside it. The pencil turns the text into an input in place,
 * in the heading's own font. Enter or leaving the field saves; Escape cancels. Place it inside the
 * heading element, so the heading keeps its level and size.
 */
export function EditableText({ value, initial = value, label, disabled = false, onSave }: {
  /** The text shown. */
  value: string;
  /** The text the input starts with, when it differs from what's shown (e.g. blank for "Untitled"). */
  initial?: string;
  /** What is being renamed, e.g. "program name". Used in the button and input labels. */
  label: string;
  disabled?: boolean;
  onSave: (text: string) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  // Enter and Escape finish before the blur that follows, so the blur mustn't save a second time.
  const done = useRef(false);

  const finish = (save: boolean) => {
    if (done.current || editing === null) return;
    done.current = true;
    const text = editing.trim();
    setEditing(null);
    if (save && text !== initial.trim()) onSave(text);
    requestAnimationFrame(() => button.current?.focus({ preventScroll: true }));
  };

  if (editing !== null) {
    return (
      <input
        autoFocus
        aria-label={`Edit ${label}`}
        value={editing}
        onChange={(e) => setEditing(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={() => finish(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); finish(true); }
          else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
        }}
        className="-mx-2 w-full min-w-0 rounded-inner border border-line bg-surface px-2 text-text [font:inherit] [letter-spacing:inherit] focus:shadow-focus focus:outline-none"
      />
    );
  }
  return (
    <span className="inline-flex max-w-full items-center gap-1.5">
      <span className="min-w-0 break-words">{value}</span>
      {disabled ? null : (
        // Faint until pointed at or focused, so it doesn't compete with the heading.
        <span className="inline-flex opacity-40 transition-opacity hover:opacity-100 focus-within:opacity-100 motion-reduce:transition-none">
          <IconButton ref={button} label={`Rename ${label}`} size="sm" onClick={() => { done.current = false; setEditing(initial); }}>
            <PencilIcon />
          </IconButton>
        </span>
      )}
    </span>
  );
}
