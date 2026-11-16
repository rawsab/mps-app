import { useEffect, useId, useRef, type ReactNode } from 'react';

/**
 * Modal built on the native <dialog>: focus moves in and is trapped, Escape closes, and focus returns
 * to the opener on close. Mount it to open it; `onClose` should unmount it.
 */
export function Dialog({
  title,
  description,
  onClose,
  children,
  footer,
}: {
  title: string;
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-title`}
      aria-describedby={description ? `${id}-description` : undefined}
      onClose={onClose}
      // A click on the backdrop lands on the <dialog> itself; clicks inside land on its content.
      onClick={(e) => {
        if (e.target === e.currentTarget) ref.current?.close();
      }}
      className="dialog m-auto w-[min(34rem,calc(100vw-2rem))] max-h-[min(40rem,calc(100dvh-2rem))] overflow-hidden rounded-card border border-line bg-surface p-0 text-text backdrop:bg-ink/75"
    >
      <div className="flex max-h-[inherit] flex-col">
        <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 id={`${id}-title`} className="text-base font-semibold">
              {title}
            </h2>
            {description ? (
              <p id={`${id}-description`} className="mt-0.5 text-sm text-muted">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label="Close"
            className="-mr-2 -mt-1 inline-flex size-11 shrink-0 items-center justify-center rounded-card text-muted hover:bg-surface-raised hover:text-text"
          >
            <svg aria-hidden viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="m4 4 8 8M12 4l-8 8" />
            </svg>
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer ? <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-4 py-3 sm:px-5">{footer}</footer> : null}
      </div>
    </dialog>
  );
}
