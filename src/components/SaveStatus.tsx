import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

const MIN_SAVING_MS = 600;
const LEAVE_MS = 160;

type Phase = 'idle' | 'saving' | 'leaving';

/**
 * An inline "Saving…" that fades in, stays at least MIN_SAVING_MS so a fast save doesn't flicker,
 * then fades out before `children` (the settled message) fades in. The settled message only
 * animates after a save, never on first render. With nothing to show, the line collapses to no
 * height (animated), so the surrounding box grows and shrinks with it. `gap` is the parent's grid
 * or flex gap, taken back while collapsed so an empty line leaves no space.
 */
export function SaveStatus({ saving, children, id, gap, className = '' }: {
  saving: boolean; children: ReactNode; id?: string; gap?: string; className?: string;
}) {
  const [phase, setPhase] = useState<Phase>(saving ? 'saving' : 'idle');
  const [afterSave, setAfterSave] = useState(false);
  const since = useRef(0);

  useEffect(() => {
    if (saving) {
      if (phase !== 'saving') {
        since.current = Date.now();
        setPhase('saving');
      }
      return;
    }
    if (phase !== 'saving') return;
    const timer = setTimeout(() => setPhase('leaving'), Math.max(0, MIN_SAVING_MS - (Date.now() - since.current)));
    return () => clearTimeout(timer);
  }, [saving, phase]);

  useEffect(() => {
    if (phase !== 'leaving') return;
    const timer = setTimeout(() => { setPhase('idle'); setAfterSave(true); }, LEAVE_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  const empty = phase === 'idle' && (children === '' || children === null || children === undefined || children === false);
  return (
    <div id={id} aria-live="polite" data-open={!empty} className="status-slot" style={gap ? { '--status-gap': gap } as CSSProperties : undefined}>
      <div className="min-h-0 overflow-hidden">
        <p className={className}>
          {phase === 'idle'
            ? <span key="settled" className={afterSave ? 'status-in' : undefined}>{children}</span>
            : <span key="saving" className={phase === 'saving' ? 'status-in' : 'status-out'}>Saving…</span>}
        </p>
      </div>
    </div>
  );
}
