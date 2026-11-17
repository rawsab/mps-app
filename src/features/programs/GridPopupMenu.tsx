import { useEffect, useLayoutEffect, useRef, useState, type RefObject, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export type GridPopupAction<T extends string> = { action: T; label: string; icon: ReactNode; disabled?: boolean; danger?: boolean; separator?: boolean };

/** Shared, viewport-clamped popup for cell actions and the bottom add tab. */
export function GridPopupMenu<T extends string>({ x, y, label, id, items, trigger, onAction, onClose }: {
  x: number; y: number; label: string; id?: string;
  items: GridPopupAction<T>[];
  trigger?: RefObject<HTMLButtonElement | null>;
  onAction: (action: T) => void;
  onClose: (restoreFocus: boolean) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x, y });
  useLayoutEffect(() => {
    const menu = root.current;
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    setPosition({ x: Math.max(8, Math.min(x, window.innerWidth - rect.width - 8)), y: Math.max(8, Math.min(y, window.innerHeight - rect.height - 8)) });
    (menu.querySelector<HTMLButtonElement>('button:not(:disabled)') ?? menu).focus({ preventScroll: true });
  }, [x, y]);
  useEffect(() => {
    const outside = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node) && !trigger?.current?.contains(e.target as Node)) onClose(false); };
    const scroll = (e: Event) => { if (!root.current?.contains(e.target as Node) && !trigger?.current?.contains(e.target as Node)) onClose(false); };
    const resize = () => onClose(false);
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', resize);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', resize);
    };
  }, [onClose, trigger]);
  return createPortal(
    <div ref={root} role="menu" id={id} aria-label={label} tabIndex={-1}
      style={{ left: position.x, top: position.y }}
      className="fixed z-50 max-h-[calc(100dvh-1rem)] w-52 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-card border border-line bg-surface p-1 shadow-xl focus:outline-none"
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); onClose(true); return; }
        const buttons = [...(root.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        let next: number;
        if (e.key === 'ArrowDown') next = (index + 1) % buttons.length;
        else if (e.key === 'ArrowUp') next = (index - 1 + buttons.length) % buttons.length;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = buttons.length - 1;
        else return;
        e.preventDefault();
        buttons[next]?.focus();
      }}>
      <div role="presentation" className="truncate px-3 py-1.5 text-xs text-muted">{label}</div>
      {items.map((item) => <button key={item.action} type="button" role="menuitem" tabIndex={-1}
        disabled={item.disabled}
        onClick={() => onAction(item.action)}
        className={`flex min-h-8 w-full items-center gap-2 rounded-card px-2.5 py-1 text-left text-sm hover:bg-surface-raised focus:bg-surface-raised focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 ${item.danger ? 'text-danger' : 'text-text'} ${item.separator ? 'mt-1 border-t border-line' : ''}`}>
        {item.icon}{item.label}
      </button>)}
    </div>, document.body,
  );
}
