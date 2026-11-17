import { useState } from 'react';
import { Alert } from './ui';

/** Uses the same entrance/exit behavior as every other alert. */
export function DismissibleNotice({ message, tone = 'success', className = '' }: { message: string | null; tone?: 'error' | 'info' | 'success'; className?: string }) {
  const [dismissed, setDismissed] = useState<string | null>(null);
  // Clearing a message permits the same text to be announced again after the next action.
  if (!message && dismissed !== null) setDismissed(null);
  return <Alert visible={!!message && message !== dismissed} tone={tone} className={className} onDismiss={() => setDismissed(message)}>{message}</Alert>;
}
