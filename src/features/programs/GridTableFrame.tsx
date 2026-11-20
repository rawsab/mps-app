import { useCallback, useId, useRef, useState, type ReactNode } from 'react';
import { SpreadsheetViewport } from '@/components/SpreadsheetViewport';
import { PopupMenu } from '@/components/PopupMenu';
import { PlusIcon, SectionIcon, DayIcon } from '@/components/icons';

export type GridAddKind = 'exercise' | 'section' | 'day';

/** Keep the add-row tab and overflow affordances anchored to the visible table width. */
export function GridTableFrame({ children, onAdd, readOnly }: { children: ReactNode; onAdd: (kind: GridAddKind) => void; readOnly: boolean }) {
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const closeMenu = useCallback((restoreFocus: boolean) => {
    setMenu(null);
    if (restoreFocus) trigger.current?.focus();
  }, []);
  return (
    <div className="min-w-0 overflow-hidden rounded-card border border-line bg-surface">
      <SpreadsheetViewport>{children}</SpreadsheetViewport>
      <button ref={trigger} type="button" aria-label="Add to spreadsheet" title="Add exercise, section or day" disabled={readOnly}
        aria-haspopup="menu" aria-expanded={menu !== null && !readOnly} aria-controls={menu ? menuId : undefined}
        onMouseDown={(event) => event.preventDefault()} onClick={(event) => {
          event.currentTarget.focus();
          const rect = event.currentTarget.getBoundingClientRect();
          setMenu((previous) => previous ? null : { x: event.clientX || rect.left + 12, y: rect.bottom });
        }}
        onContextMenu={(event) => { event.preventDefault(); if (!readOnly) setMenu({ x: event.clientX, y: event.clientY }); }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            const rect = event.currentTarget.getBoundingClientRect();
            setMenu({ x: rect.left + 12, y: rect.bottom });
          }
        }}
        className="flex h-7 w-full items-center justify-center border-t border-line bg-surface-raised text-gold-fg transition-colors hover:bg-gold/15 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gold disabled:cursor-not-allowed disabled:opacity-40">
        <svg aria-hidden viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M10 4v12M4 10h12" /></svg>
      </button>
      {menu && !readOnly ? <PopupMenu id={menuId} x={menu.x} y={menu.y} label="Add to spreadsheet" trigger={trigger}
        items={[
          { action: 'exercise', label: 'New exercise', icon: <PlusIcon /> },
          { action: 'section', label: 'New section', icon: <SectionIcon /> },
          { action: 'day', label: 'New day', icon: <DayIcon /> },
        ]} onClose={closeMenu} onAction={(kind: GridAddKind) => { closeMenu(true); onAdd(kind); }} /> : null}
    </div>
  );
}
