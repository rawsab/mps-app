import { useId, useRef, useState } from 'react';
import { ArrowDownIcon, ArrowUpIcon, CopyIcon, MoreIcon, SectionsIcon, TrashIcon } from '@/components/icons';
import { GridPopupMenu } from './GridPopupMenu';
export type WeekAction = 'duplicate' | 'delete' | 'up' | 'down' | 'toggleSections';
export function WeekGridMenu({ label, first, last, disabled, sectionsEnabled, onAction }: {
  label: string; first: boolean; last: boolean; disabled: boolean; sectionsEnabled: boolean; onAction: (action: WeekAction) => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const close = (restore: boolean) => { setPosition(null); if (restore) trigger.current?.focus({ preventScroll: true }); };
  return <>
    <button ref={trigger} type="button" aria-label={`Options for ${label}`} aria-haspopup="menu" aria-expanded={!!position} aria-controls={position ? id : undefined}
      disabled={disabled} className="flex size-9 shrink-0 items-center justify-center rounded-card text-muted hover:bg-surface-raised hover:text-text disabled:opacity-40"
      onClick={() => { const rect = trigger.current!.getBoundingClientRect(); setPosition(position ? null : { x: rect.right - 208, y: rect.bottom }); }}>
      <MoreIcon />
    </button>
    {position ? <GridPopupMenu {...position} id={id} label={label} trigger={trigger} onClose={close}
      onAction={(action: WeekAction) => { close(true); onAction(action); }} items={[
        { action: 'toggleSections', label: `${sectionsEnabled ? 'Disable' : 'Enable'} sections`, icon: sectionsEnabled ? <span aria-hidden className="inline-grid size-4 place-items-center">✓</span> : <SectionsIcon /> },
        { action: 'duplicate', label: 'Duplicate week', icon: <CopyIcon /> },
        { action: 'delete', label: 'Delete week', icon: <TrashIcon />, danger: true },
        { action: 'up', label: 'Move up', icon: <ArrowUpIcon />, disabled: first, separator: true },
        { action: 'down', label: 'Move down', icon: <ArrowDownIcon />, disabled: last },
      ]} /> : null}
  </>;
}
