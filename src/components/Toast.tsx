import { useEffect, useRef, useState, type ComponentPropsWithRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { NoticePresence } from './NoticePresence';

/** How long a toast (and its action) stays, unless the pointer or focus is on it. */
export const TOAST_MS = 10_000;
/** NoticePresence's fold-away (index.css `.notice-motion[data-leaving]`: 100ms delay + 280ms). */
export const TOAST_EXIT_MS = 400;

/** `key` changes per message, so a newer one fades over the last instead of reusing it. */
export type ToastMessage = { key: number; content: ReactNode; action?: ReactNode };

/**
 * For an `onSaved(message, options)` callback: `toast` shows the message as a Toast instead of an
 * inline notice; `undoAttendance` (a meeting id) adds Undo to it.
 */
export type SavedOptions = { toast?: boolean; undoAttendance?: string };

export const toastMessage = (content: ReactNode, action?: ReactNode): ToastMessage => ({ key: Date.now(), content, action });

/** A small action inside a toast, e.g. Undo. */
export function ToastAction({ className = '', type = 'button', ...rest }: ComponentPropsWithRef<'button'>) {
  return <button type={type} className={`min-h-11 font-medium text-gold-fg underline underline-offset-2 disabled:opacity-50 ${className}`} {...rest} />;
}

/** One shared stack at the bottom of the screen, so toasts from different sections never overlap. */
function toastRoot() {
  let root = document.getElementById('toast-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'toast-root';
    root.className = 'pointer-events-none fixed inset-x-0 bottom-4 z-40 flex flex-col items-center px-4';
    document.body.append(root);
  }
  return root;
}

/**
 * A confirmation that floats at the bottom of the screen, so showing or hiding it never moves the
 * page. Keep it mounted (it's the live region) and pass `null` to hide it. It calls `onExpire` after
 * TOAST_MS, paused while hovered or focused. Portalled to the body: the route's entrance transform
 * would otherwise anchor `fixed` to the page content.
 */
export function Toast({ toast, onExpire }: { toast: ToastMessage | null; onExpire: () => void }) {
  const [paused, setPaused] = useState(false);
  const expire = useRef(onExpire);
  expire.current = onExpire;
  // Keyed on the message, so owners can rebuild `toast` each render (e.g. an action's pending state).
  const key = toast?.key;
  useEffect(() => {
    if (key === undefined || paused) return;
    const timer = setTimeout(() => expire.current(), TOAST_MS);
    return () => clearTimeout(timer);
  }, [key, paused]);

  return createPortal(
    <div role="status" aria-live="polite" className="pointer-events-auto max-w-full"
      onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false); }}>
      <NoticePresence visible={!!toast}>
        {toast ? (
          // The spacing above sits inside the fold, so a stacked toast closes the gap as it leaves.
          <div className="pt-2">
            <p key={toast.key} className="notice-swap flex min-h-11 flex-wrap items-center gap-x-3 rounded-card border border-line bg-surface-raised px-4 py-1 text-sm shadow-lg">
              <span>{toast.content}</span>
              {toast.action}
            </p>
          </div>
        ) : null}
      </NoticePresence>
    </div>,
    toastRoot(),
  );
}
