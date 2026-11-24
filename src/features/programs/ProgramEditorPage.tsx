import { useEffect, useState, type ReactNode } from 'react';
import { Link, useBlocker, useParams, useSearchParams } from 'react-router';
import { DismissibleNotice } from '@/components/DismissibleNotice';
import { DraftSaveIndicator as SaveIndicator } from '@/components/DraftSaveIndicator';
import { CautionIcon, CopyIcon, SectionIcon, SpreadsheetIcon } from '@/components/icons';
import { scrollBehavior } from './useWeekMotion';
import { Dialog } from '@/components/Dialog';
import { Tabs } from '@/components/controls';
import { Alert, Badge, Button, EmptyState, PageHeader } from '@/components/ui';
import { EditableText } from '@/components/EditableText';
import { DuplicateProgramDialog } from './DuplicateProgramDialog';
import { downloadProgram } from './download';
import { ActionItem, ActionsMenu } from '@/components/ActionsMenu';
import { LoadingRegion, SkeletonText, SkeletonHeader, SkeletonTable } from '@/components/Skeleton';
import { gridRows } from '@/domain/programs/grid';
import { validateForPublish } from '@/domain/programs/contract';
import { formatDate } from '@/lib/format';
import { SERVICE_SHORT_LABELS } from '@/lib/services';
import { friendlyError } from '@/features/clients/api';
import { useProgram } from './api';
import { GridView } from './GridView';
import { publishDestination, rejectedDestination } from './programNavigation';
import { ProgramDetailsFields, ProgramView } from './ProgramView';
import { DraftEditorContext, useDraftEditor, type DraftEditor } from './useDraftEditor';

type View = 'program' | 'grid';

export function ProgramEditorPage() {
  const { clientId, programId } = useParams();
  const program = useProgram(programId);

  if (program.isPending) return <EditorSkeleton label="Loading program" />;
  if (program.error) return <Alert title="Could not load program">{friendlyError(program.error)}</Alert>;
  if (!program.data || program.data.client_id !== clientId) {
    return (
      <EmptyState title="Program not found" action={<BackLink to={`/coach/clients/${clientId}`} label="Back to client" />}>
        The program does not exist or its client is not assigned to you.
      </EmptyState>
    );
  }
  // Keyed so opening another program (e.g. a new copy) starts a fresh editor.
  return <Editor key={program.data.id} program={program.data} clientName={program.data.clients?.full_name ?? 'Client'} />;
}

/** The editor's back link, header and spreadsheet while the program or its draft loads. */
function EditorSkeleton({ label, back }: { label: string; back?: ReactNode }) {
  return (
    <div className="grid gap-5">
      {back ? <div>{back}</div> : null}
      <LoadingRegion label={label} className="grid gap-5">
        {back ? null : <SkeletonText width="w-28" />}
        <SkeletonHeader titleWidth="w-64" subtitle action />
        <SkeletonTable rows={8} />
      </LoadingRegion>
    </div>
  );
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
  // Spreadsheet is the default; List View is opt-in via ?view=program.
  const view: View = params.get('view') === 'program' ? 'program' : 'grid';
  const { state } = editor;
  const [reviewing, setReviewing] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const focusKey = params.get('focus');
  const hasDraft = state.draft !== null;
  useEffect(() => {
    if (state.publishProblems?.length) setReviewing(true);
  }, [state.publishProblems]);
  useEffect(() => {
    if (view !== 'program' || !focusKey || !state.draft || reviewing) return;
    const frame = requestAnimationFrame(() => {
      const field = document.querySelector<HTMLElement>(`[data-edit-key="${CSS.escape(focusKey)}"]`);
      if (field) {
        for (let ancestor = field.parentElement; ancestor; ancestor = ancestor.parentElement) {
          if (ancestor instanceof HTMLDetailsElement) ancestor.open = true;
        }
        field.focus({ preventScroll: true });
        field.scrollIntoView({ block: 'center', behavior: scrollBehavior() });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [focusKey, view, hasDraft, reviewing]);

  // Leaving with unsaved or refused edits asks first, in-app and on reload/close.
  const blocker = useBlocker(({ currentLocation, nextLocation }) => editor.hasUnsavedWork && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (!editor.hasUnsavedWork) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [editor.hasUnsavedWork]);

  const back = <BackLink to={`/coach/clients/${program.client_id}`} label={clientName} />;
  if (state.saveState === 'loading') return <EditorSkeleton label="Loading draft" back={back} />;
  if (!state.draft) {
    return (
      <div className="grid gap-5">
        <div>{back}</div>
        <Alert title="Could not load the draft">{state.error}</Alert>
      </div>
    );
  }

  const problems = state.publishProblems ?? validateForPublish(state.draft);
  const rejectedCount = Object.keys(state.rejected).length;
  const reviewProblems = [...problems, ...Object.entries(state.rejected).map(([key, edit]) => ({ path: `rejected:${key}`, message: edit.message }))];
  const archived = program.archived_at !== null;
  const programStatus =
    state.baseStatus === 'draft'
      ? 'Draft · staff only'
      : state.baseStatus === 'published'
        ? 'Live'
        : 'New program';

  return (
    <DraftEditorContext.Provider value={editor}>
      <div className="grid gap-5" onKeyDown={(e) => {
        if (archived || state.publishing || !(e.ctrlKey || e.metaKey) || e.altKey) return;
        const target = e.target as HTMLElement;
        if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
        const key = e.key.toLowerCase();
        if (key === 'z' || (key === 'y' && e.ctrlKey)) {
          e.preventDefault();
          if (e.shiftKey || key === 'y') editor.redo();
          else editor.undo();
        }
      }}>
        <div>{back}</div>
        <PageHeader
          title={<EditableText value={state.draft.title.trim() || (program.service === 'mesocycle' ? 'Untitled program style' : 'Untitled program')}
            initial={state.draft.title} label="program name" disabled={archived || state.publishing}
            onSave={(title) => editor.dispatch([{ type: 'updateProgram', patch: { title } }])} />}
          subtitle={
            <span className="flex flex-col gap-2">
              {program.service === 'mesocycle' ? <span className="break-words text-base">{state.draft.programTheme?.trim() || 'Program Theme'}</span> : null}
              <span className="inline-flex flex-wrap items-center gap-2">
              <Badge>{SERVICE_SHORT_LABELS[program.service]}</Badge>
              <span>{programStatus}</span>
              </span>
            </span>
          }
          actions={program.service === 'mesocycle' && program.current_revision_id ? (
            // Logs belong to the published program, so the link appears once something is published.
            <Link to={`/coach/clients/${program.client_id}/programs/${program.id}/log`} className="inline-flex min-h-11 items-center gap-1.5 rounded-card border border-line px-4 text-sm font-medium hover:border-muted/70">
              Client log <span aria-hidden>→</span>
            </Link>
          ) : undefined}
        />
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-y border-line py-2">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex gap-1" role="group" aria-label="Edit history">
                <Button variant="ghost" disabled={archived || state.publishing || !editor.canUndo} title="Undo (Ctrl/Cmd+Z)"
                  onMouseDown={(e) => e.preventDefault()} onClick={(e) => { e.currentTarget.focus(); editor.undo(); }}>
                  <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="m8 4-5 5 5 5M3 9h11a6 6 0 0 1 0 12" /></svg> Undo
                </Button>
                <Button variant="ghost" disabled={archived || state.publishing || !editor.canRedo} title="Redo (Ctrl/Cmd+Shift+Z)"
                  onMouseDown={(e) => e.preventDefault()} onClick={(e) => { e.currentTarget.focus(); editor.redo(); }}>
                  <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="m16 4 5 5-5 5M21 9H10a6 6 0 0 0 0 12" /></svg> Redo
                </Button>
              </div>
              <SaveIndicator state={state.saveState} onRetry={() => void editor.save()} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* The copy is made from what's saved, so unsaved edits must land first. */}
              <Button variant="ghost" disabled={editor.hasUnsavedWork || state.publishing} title={editor.hasUnsavedWork ? 'Wait for your changes to save' : undefined}
                onClick={() => setDuplicating(true)}><CopyIcon /> Duplicate</Button>
              {/* Downloads what's on screen, unsaved edits included. */}
              <ActionsMenu label="Download program">
                <ActionItem onClick={() => downloadProgram(state.draft!, clientName, 'xlsx')}>Download spreadsheet (.xlsx)</ActionItem>
                <ActionItem onClick={() => downloadProgram(state.draft!, clientName, 'json')}>Download program file (.json)</ActionItem>
              </ActionsMenu>
              <Button variant="ghost" onClick={() => setReviewing(true)}>{reviewProblems.length > 0 ? <CautionIcon /> : null}{reviewProblems.length > 0 ? `${reviewProblems.length} publish ${reviewProblems.length === 1 ? 'issue' : 'issues'}` : 'Ready to publish'}</Button>
              <Button onClick={() => { if (reviewProblems.length > 0) setReviewing(true); else void editor.publish(); }} busy={state.publishing} disabled={archived || state.saveState === 'conflict'}>
                Publish
              </Button>
            </div>
        </div>

        <Banners editor={editor} archived={archived} rejectedCount={rejectedCount} />

        <Tabs label="Editor view" idPrefix="editor-tab" panelId="editor-panel" value={view}
          options={[{ value: 'grid', label: 'Spreadsheet', icon: <SpreadsheetIcon /> }, { value: 'program', label: 'List View', icon: <SectionIcon /> }]}
          onChange={(next) => setParams((previous) => {
            const params = new URLSearchParams(previous);
            params.set('view', next);
            params.delete('focus');
            return params;
          }, { replace: true })} />

        <div id="editor-panel" role="tabpanel" aria-labelledby={`editor-tab-${view}`} className="min-w-0" tabIndex={0}>
          {view === 'program' ? <ProgramView readOnly={archived} /> : <>
            {/* Same fields as List View's Program details panel, so either view can edit them. */}
            <section aria-labelledby="grid-program-details" className="mb-6 min-w-0 border-b border-line pb-6">
              <h2 id="grid-program-details" className="mb-3 text-xl font-semibold">Program details</h2>
              <fieldset disabled={archived} className="min-w-0"><ProgramDetailsFields /></fieldset>
            </section>
            <GridView readOnly={archived} />
          </>}
        </div>

        {duplicating ? <DuplicateProgramDialog clientId={program.client_id} programId={program.id} onClose={() => setDuplicating(false)}
          title={state.draft.title.trim() || 'Untitled program'} canReplace={!archived && program.current_revision_id !== null} /> : null}
        {reviewing ? <Dialog title="Publish readiness" onClose={() => setReviewing(false)} footer={<Button variant="secondary" onClick={() => setReviewing(false)}>Close review</Button>}>
          <ReadinessPanel problems={reviewProblems} fromServer={state.publishProblems !== null} onNavigate={(path) => {
            const problem = reviewProblems.find((problem) => problem.path === path);
            const destination = path.startsWith('rejected:')
              ? rejectedDestination(state.draft!, path.slice('rejected:'.length))
              : publishDestination(state.draft!, path, problem?.message.endsWith(': no target') ? 'effort' : 'sets');
            setParams((previous) => {
              const next = new URLSearchParams(previous);
              const hasGridTarget = gridRows(state.draft!).some((row) => row.dayId === destination.item || (destination.item === 'shared' && !row.dayId));
              next.set('view', view === 'grid' && hasGridTarget ? 'grid' : 'program');
              next.set('item', destination.item);
              if (destination.field) next.set('focus', destination.field);
              else next.delete('focus');
              return next;
            }, { replace: true });
            setReviewing(false);
          }} />
        </Dialog> : null}
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

function Banners({ editor, archived, rejectedCount }: { editor: DraftEditor; archived: boolean; rejectedCount: number }) {
  const { state } = editor;
  return (
    <>
      <Alert visible={!!archived} tone="info" title="Archived">This program is archived. Its history is kept, and it can no longer be edited or published.</Alert>
      <Alert visible={!!state.recovery} tone="info" title="Unsaved edits found on this device">
        <p>From {state.recovery ? formatDate(state.recovery.at) : ''}. They were never saved to the server.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button className="min-h-10" onClick={() => void editor.restoreRecovery()}>
            Restore them
          </Button>
          <Button className="min-h-10" variant="secondary" onClick={editor.discardRecovery}>
            Discard
          </Button>
        </div>
      </Alert>
      <Alert visible={state.saveState === 'conflict'} title="This draft changed somewhere else">
        <p>
          Another editor changed or published this program after you opened it. Nothing was overwritten, and your
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
      <Alert visible={state.saveState === 'error' && !!state.error} title="Not saved">
        {state.error}{' '}
        <button type="button" className="link font-medium" onClick={() => void editor.save()}>
          Retry now
        </button>
      </Alert>
      <Alert visible={!!(state.saveState !== 'error' && state.saveState !== 'conflict' && state.error)} title="Not published">{state.error}</Alert>
      <DismissibleNotice message={state.publishedNotice} className="[--notice-gap:1.25rem]" />
      <Alert visible={rejectedCount > 0} tone="info">
        {rejectedCount} {rejectedCount === 1 ? 'edit was' : 'edits were'} not accepted and {rejectedCount === 1 ? 'is' : 'are'} marked in red. Fix or press Escape in the field to
        discard.
      </Alert>
    </>
  );
}

function ReadinessPanel({ problems, fromServer, onNavigate }: { problems: { path: string; message: string }[]; fromServer: boolean; onNavigate: (path: string) => void }) {
  return (
    <section aria-labelledby="readiness" className="px-4 pb-4 pt-2 sm:px-5">
      <h2 id="readiness" className="text-base font-semibold">
        Ready to publish?
      </h2>
      {problems.length === 0 ? (
        <p className="mt-1 text-sm text-muted">Yes. Publishing makes this draft the client’s current program. Their completed workout history is preserved.</p>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted">{fromServer ? 'The server refused to publish:' : 'Not yet. Fix these first:'}</p>
          <ul className="mt-2 grid gap-0.5 text-sm">
            {problems.map((p, i) => (
              <li key={`${p.path}-${i}`}>
                <button type="button" onClick={() => onNavigate(p.path)} className="flex min-h-10 w-full items-center justify-between gap-3 rounded-card px-2 py-1.5 text-left hover:bg-surface-raised">
                  <CautionIcon /><span className="flex-1">{p.message}</span><span aria-hidden className="text-gold-fg">→</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
