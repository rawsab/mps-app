import { useEffect } from 'react';
import { Link, useBlocker, useParams, useSearchParams } from 'react-router';
import { Dialog } from '@/components/Dialog';
import { Alert, Badge, Button, EmptyState, PageHeader, Spinner } from '@/components/ui';
import { validateForPublish } from '@/domain/programs/contract';
import { formatDate } from '@/lib/format';
import { SERVICE_SHORT_LABELS } from '@/lib/services';
import { friendlyError } from '@/features/clients/api';
import { useProgram } from './api';
import { GridView } from './GridView';
import { ProgramView } from './ProgramView';
import { DraftEditorContext, useDraftEditor, type DraftEditor, type SaveState } from './useDraftEditor';

type View = 'program' | 'grid';

export function ProgramEditorPage() {
  const { clientId, programId } = useParams();
  const program = useProgram(programId);

  if (program.isPending) return <Spinner label="Loading program" />;
  if (program.error) return <Alert title="Could not load program">{friendlyError(program.error)}</Alert>;
  if (!program.data || program.data.client_id !== clientId) {
    return (
      <EmptyState title="Program not found" action={<BackLink to={`/coach/clients/${clientId}`} label="Back to client" />}>
        The program does not exist or its client is not assigned to you.
      </EmptyState>
    );
  }
  return <Editor program={program.data} clientName={program.data.clients?.full_name ?? 'Client'} />;
}

function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="-my-3 inline-flex min-h-11 items-center gap-1.5 text-sm text-muted hover:text-text">
      <span aria-hidden className="arrow-back">←</span>
      <span>{label}</span>
    </Link>
  );
}

function Editor({ program, clientName }: { program: NonNullable<ReturnType<typeof useProgram>['data']>; clientName: string }) {
  const editor = useDraftEditor({ id: program.id, service: program.service });
  const [params, setParams] = useSearchParams();
  const view: View = params.get('view') === 'grid' ? 'grid' : 'program';
  const { state } = editor;

  // Leaving with unsaved or refused edits asks first, in-app and on reload/close.
  const blocker = useBlocker(({ currentLocation, nextLocation }) => editor.hasUnsavedWork && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (!editor.hasUnsavedWork) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [editor.hasUnsavedWork]);

  const back = <BackLink to={`/coach/clients/${program.client_id}`} label={clientName} />;
  if (state.saveState === 'loading') return <Spinner label="Loading draft" />;
  if (!state.draft) {
    return (
      <div className="grid gap-5">
        <div>{back}</div>
        <Alert title="Could not load the draft">{state.error}</Alert>
      </div>
    );
  }

  const problems = validateForPublish(state.draft);
  const rejectedCount = Object.keys(state.rejected).length;
  const archived = program.archived_at !== null;
  const revisionLabel =
    state.baseStatus === 'draft'
      ? `Draft of revision ${state.revisionNumber}`
      : state.baseStatus === 'published'
        ? `Revision ${state.revisionNumber} is live. Edits start a new draft.`
        : 'New program, not yet saved';

  return (
    <DraftEditorContext.Provider value={editor}>
      <div className="grid gap-5">
        <div>{back}</div>
        <PageHeader
          title={state.draft.title.trim() || 'Untitled program'}
          subtitle={
            <span className="inline-flex flex-wrap items-center gap-2">
              <Badge>{SERVICE_SHORT_LABELS[program.service]}</Badge>
              <span>{revisionLabel}</span>
            </span>
          }
          actions={
            <div className="flex flex-wrap items-center gap-3">
              <SaveIndicator state={state.saveState} onRetry={() => void editor.save()} />
              <Button onClick={() => void editor.publish()} busy={state.publishing} disabled={archived || state.saveState === 'conflict'}>
                Publish
              </Button>
            </div>
          }
        />

        <Banners editor={editor} archived={archived} rejectedCount={rejectedCount} />

        <div role="tablist" aria-label="Editor view" className="flex gap-1 border-b border-line">
          {(['program', 'grid'] as const).map((v) => (
            <button
              key={v}
              role="tab"
              type="button"
              aria-selected={view === v}
              aria-controls="editor-panel"
              onClick={() => setParams(v === 'grid' ? { view: 'grid' } : {}, { replace: true })}
              className={`-mb-px min-h-11 border-b-2 px-3 text-sm ${view === v ? 'border-gold font-medium text-text' : 'border-transparent text-muted hover:text-text'}`}
            >
              {v === 'program' ? 'Program' : 'Grid'}
            </button>
          ))}
        </div>

        <div id="editor-panel" role="tabpanel" className={archived ? 'pointer-events-none opacity-60' : undefined} aria-disabled={archived || undefined}>
          {view === 'program' ? <ProgramView /> : <GridView />}
        </div>

        <ReadinessPanel problems={state.publishProblems ?? problems} fromServer={state.publishProblems !== null} />
      </div>

      {blocker.state === 'blocked' ? (
        <Dialog
          title="Leave with unsaved edits?"
          description={
            state.saveState === 'conflict'
              ? 'Someone else changed this draft and yours is not saved. Leaving keeps a copy on this device only.'
              : 'Some edits are not saved yet. A copy stays on this device and is offered when you come back.'
          }
          onClose={() => blocker.reset()}
          footer={
            <>
              <Button variant="secondary" onClick={() => blocker.reset()}>
                Stay
              </Button>
              <Button variant="danger" onClick={() => blocker.proceed()}>
                Leave
              </Button>
            </>
          }
        >
          {rejectedCount > 0 ? (
            <p className="px-4 py-3 text-sm text-muted sm:px-5">
              {rejectedCount} {rejectedCount === 1 ? 'field has' : 'fields have'} text that was not accepted and will be lost.
            </p>
          ) : (
            <span />
          )}
        </Dialog>
      ) : null}
    </DraftEditorContext.Provider>
  );
}

const SAVE_LABELS: Record<Exclude<SaveState, 'loading'>, string> = {
  saved: 'All changes saved',
  unsaved: 'Unsaved changes',
  saving: 'Saving…',
  error: 'Not saved',
  conflict: 'Conflict',
};

function SaveIndicator({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  if (state === 'loading') return null;
  const tone = state === 'error' || state === 'conflict' ? 'text-danger' : state === 'saved' ? 'text-muted' : 'text-text';
  return (
    <span role="status" aria-live="polite" className={`inline-flex items-center gap-2 text-sm ${tone}`}>
      {state === 'saving' ? <Spinner small /> : <span aria-hidden className={`size-2 rounded-full ${state === 'saved' ? 'bg-success' : state === 'unsaved' ? 'bg-gold' : 'bg-danger'}`} />}
      {SAVE_LABELS[state]}
      {state === 'error' ? (
        <button type="button" onClick={onRetry} className="link min-h-11 text-gold-fg">
          Retry
        </button>
      ) : null}
    </span>
  );
}

function Banners({ editor, archived, rejectedCount }: { editor: DraftEditor; archived: boolean; rejectedCount: number }) {
  const { state } = editor;
  return (
    <>
      {archived ? <Alert tone="info" title="Archived">This program is archived. Its history is kept, and it can no longer be edited or published.</Alert> : null}
      {state.recovery ? (
        <Alert tone="info" title="Unsaved edits found on this device">
          <p>From {formatDate(state.recovery.at)}. They were never saved to the server.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button className="min-h-10" onClick={() => void editor.restoreRecovery()}>
              Restore them
            </Button>
            <Button className="min-h-10" variant="secondary" onClick={editor.discardRecovery}>
              Discard
            </Button>
          </div>
        </Alert>
      ) : null}
      {state.saveState === 'conflict' ? (
        <Alert title="This draft changed somewhere else">
          <p>
            Another editor saved {state.conflictVersion ? `version ${state.conflictVersion}` : 'or published'} after you opened it. Nothing was overwritten, and your
            edits are still here.
          </p>
          {state.error ? <p className="mt-1">{state.error}</p> : null}
          <div className="mt-2 flex flex-wrap gap-2">
            <Button className="min-h-10" onClick={() => void editor.resolveConflict('rebase')}>
              Apply my edits to the latest
            </Button>
            <Button className="min-h-10" variant="secondary" onClick={() => void editor.resolveConflict('overwrite')}>
              Replace theirs with mine
            </Button>
            <Button className="min-h-10" variant="danger" onClick={() => void editor.resolveConflict('discard')}>
              Discard mine
            </Button>
          </div>
        </Alert>
      ) : null}
      {state.saveState === 'error' && state.error ? (
        <Alert title="Not saved">
          {state.error}{' '}
          <button type="button" className="link font-medium" onClick={() => void editor.save()}>
            Retry now
          </button>
        </Alert>
      ) : null}
      {state.saveState !== 'error' && state.saveState !== 'conflict' && state.error ? <Alert title="Not published">{state.error}</Alert> : null}
      {state.publishedNotice ? <Alert tone="success">{state.publishedNotice}</Alert> : null}
      {rejectedCount > 0 ? (
        <Alert tone="info">
          {rejectedCount} {rejectedCount === 1 ? 'edit was' : 'edits were'} not accepted and {rejectedCount === 1 ? 'is' : 'are'} marked in red. Fix or press Escape in the field to
          discard.
        </Alert>
      ) : null}
    </>
  );
}

function ReadinessPanel({ problems, fromServer }: { problems: { path: string; message: string }[]; fromServer: boolean }) {
  return (
    <section aria-labelledby="readiness" className="rounded-card border border-line bg-surface p-4 sm:p-5">
      <h2 id="readiness" className="text-base font-semibold">
        Ready to publish?
      </h2>
      {problems.length === 0 ? (
        <p className="mt-1 text-sm text-muted">Yes. Publishing makes this draft the client’s current program; their completed sessions keep the revision they used.</p>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted">{fromServer ? 'The server refused to publish:' : 'Not yet. Fix these first:'}</p>
          <ul className="mt-2 grid gap-1 text-sm">
            {problems.slice(0, 20).map((p, i) => (
              <li key={`${p.path}-${i}`} className="flex gap-2">
                <span aria-hidden className="text-danger">•</span>
                {p.message}
              </li>
            ))}
            {problems.length > 20 ? <li className="text-muted">and {problems.length - 20} more</li> : null}
          </ul>
        </>
      )}
    </section>
  );
}
