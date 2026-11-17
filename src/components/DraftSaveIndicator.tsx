import { Spinner } from './ui';

export type DraftSaveState = 'loading' | 'saved' | 'unsaved' | 'saving' | 'error' | 'conflict';
const labels: Record<Exclude<DraftSaveState, 'loading'>, string> = {
  saved: 'All changes saved', unsaved: 'Unsaved changes', saving: 'Saving…', error: 'Not saved', conflict: 'Conflict',
};

/** Shared draft feedback for training and nutrition editors. */
export function DraftSaveIndicator({ state, onRetry }: { state: DraftSaveState; onRetry: () => void }) {
  if (state === 'loading') return null;
  const tone = state === 'error' || state === 'conflict' ? 'text-danger' : state === 'saved' ? 'text-muted' : 'text-text';
  return <span role="status" aria-live="polite" className={`inline-flex items-center gap-2 text-sm ${tone}`}>
    {state === 'saving' ? <Spinner small /> : <span aria-hidden className={`size-2 rounded-full ${state === 'saved' ? 'bg-success' : state === 'unsaved' ? 'bg-gold' : 'bg-danger'}`} />}
    {labels[state]}
    {state === 'error' ? <button type="button" onClick={onRetry} className="link min-h-11 text-gold-fg">Retry</button> : null}
  </span>;
}
