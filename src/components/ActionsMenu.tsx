import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { IconButton } from './controls';
import { MoreIcon } from './icons';

/** A disclosure of ordinary buttons: Tab navigates actions; Escape returns to the trigger. */
export function ActionsMenu({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  return (
    <div ref={root} className="relative shrink-0" onKeyDown={(event) => {
      if (event.key === 'Escape' && open) {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        trigger.current?.focus();
      }
    }} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <IconButton ref={trigger} label={label} title={label} aria-expanded={open} aria-controls={id}
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => { event.currentTarget.focus(); setOpen((value) => !value); }}>
        <MoreIcon />
      </IconButton>
      {open ? <div id={id} aria-label={label} className="absolute right-0 top-full z-30 grid w-52 max-w-[calc(100vw-2rem)] rounded-card border border-line bg-surface p-1 shadow-lg"
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('button')) {
            // Return focus before an action can open a dialog, so its opener remains mounted.
            trigger.current?.focus();
            setOpen(false);
          }
        }}>
        {children}
      </div> : null}
    </div>
  );
}

export const actionItemClass = 'flex min-h-11 w-full items-center gap-2 rounded-card px-3 text-left text-sm hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-40';
