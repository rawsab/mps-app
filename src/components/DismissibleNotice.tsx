import { useEffect, useState } from 'react';
import { Alert } from './ui';

/**
 * An Alert that unfolds into place when `message` appears and folds away when it is dismissed or
 * cleared. The text is kept while folding so the exit animates instead of blinking out. Set
 * `--notice-gap` to the parent's gap so neighbours move smoothly instead of jumping at the end.
 */
export function DismissibleNotice({ message, tone = 'success', className = '' }: { message: string | null; tone?: 'error' | 'info' | 'success'; className?: string }) {
  const [shown, setShown] = useState(message);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (message) {
      setShown(message);
      setLeaving(false);
    } else setLeaving(true);
  }, [message]);
  if (!shown) return null;
  return (
    <div className={`notice-motion ${className}`} data-leaving={leaving || undefined}
      onTransitionEnd={(e) => { if (leaving && e.target === e.currentTarget && e.propertyName === 'grid-template-rows') setShown(null); }}>
      <div className="min-h-0 overflow-hidden">
        <Alert tone={tone} onDismiss={() => setLeaving(true)}>{shown}</Alert>
      </div>
    </div>
  );
}
