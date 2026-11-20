import { useEffect, useId, useRef, type ReactNode } from 'react';
import { IconButton } from './controls';
import { Button } from './ui';
import { CloseIcon } from './icons';

/**
 * Modal built on the native <dialog>: focus moves in and is trapped, Escape closes, and focus returns
 * to the opener on close. Mount it to open it; `onClose` should unmount it. However it unmounts, it
 * fades out on the way (see `leave`).
 */
export function Dialog({
  title,
  description,
  onClose,
  children,
  footer,
  wide = false,
}: {
  title: string;
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  const id = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) {
      opener.current = document.activeElement;
      dialog.showModal();
    }
    // After the commit, so React has already detached the node.
    return () => queueMicrotask(() => leave(dialog, opener.current));
  }, []);

  // Closing asks the owner to unmount instead of calling close(), which would hide the dialog a frame
  // before the exit animation could start.
  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-title`}
      aria-describedby={description ? `${id}-description` : undefined}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // Browsers can refuse to cancel a repeated Escape and close anyway.
      onClose={onClose}
      // A click on the backdrop lands on the <dialog> itself; clicks inside land on its content.
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={`dialog m-auto ${wide ? 'w-[min(48rem,calc(100vw-2rem))]' : 'w-[min(34rem,calc(100vw-2rem))]'} max-h-[min(40rem,calc(100dvh-2rem))] overflow-hidden rounded-card border border-line bg-surface p-0 text-text backdrop:bg-ink/75`}
    >
      <div className="flex max-h-[inherit] flex-col">
        {/* The title sits on the close button's centre line; a description goes underneath. */}
        <header className="flex items-start justify-between gap-3 border-b border-line py-1.5 pl-4 pr-2 sm:pl-5">
          <div className={`min-w-0 ${description ? 'pb-1.5' : ''}`}>
            <h2 id={`${id}-title`} className="flex min-h-9 items-center text-base font-semibold">
              {title}
            </h2>
            {description ? (
              <p id={`${id}-description`} className="-mt-1 text-sm text-muted">
                {description}
              </p>
            ) : null}
          </div>
          <IconButton label="Close" size="sm" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer ? <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-4 py-3 sm:px-5">{footer}</footer> : null}
      </div>
    </dialog>
  );
}

/**
 * Plays the exit on the node React just removed: it goes back on <body> as an inert, non-modal copy
 * (inputs keep what was typed), fades out with its scrim and is then dropped. Owners mostly close a
 * dialog by unmounting it, so this is the one place every exit passes through.
 */
function leave(dialog: HTMLDialogElement, opener: Element | null) {
  // StrictMode's rehearsal unmount keeps the node in place.
  if (dialog.isConnected) return;
  // Unmounting an open modal drops focus on <body>; send it back unless something else took it.
  const active = document.activeElement;
  if (opener instanceof HTMLElement && opener.isConnected && (!active || active === document.body)) {
    opener.focus({ preventScroll: true });
  }
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  dialog.inert = true;
  dialog.setAttribute('data-leaving', '');
  dialog.setAttribute('open', '');
  document.body.append(dialog);
  const drop = () => dialog.remove();
  dialog.addEventListener('animationend', (e) => { if (e.target === dialog) drop(); });
  window.setTimeout(drop, 400);
}

/** The padded content area of a dialog. Lay out its children with `className`, e.g. `grid gap-4`. */
export function DialogBody({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`p-4 sm:p-5 ${className}`}>{children}</div>;
}

/**
 * Cancel plus one confirming action. While `pending` the dialog can't be dismissed and the
 * confirming button shows a spinner; close it from `onConfirm`'s success handler.
 */
export function ConfirmDialog({ title, description, confirmLabel, cancelLabel = 'Cancel', tone = 'primary', pending = false, disabled = false, onConfirm, onClose, children }: {
  title: string;
  description?: ReactNode;
  confirmLabel: ReactNode;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
  pending?: boolean;
  disabled?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  children?: ReactNode;
}) {
  return (
    <Dialog title={title} description={description} onClose={() => { if (!pending) onClose(); }} footer={<>
      <Button variant="secondary" disabled={pending} onClick={onClose}>{cancelLabel}</Button>
      <Button variant={tone} busy={pending} disabled={disabled} onClick={onConfirm}>{confirmLabel}</Button>
    </>}>
      {children}
    </Dialog>
  );
}
