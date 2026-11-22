import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useBlocker, useLocation, useParams } from 'react-router';
import { Dialog } from '@/components/Dialog';
import { DisclosureSummary } from '@/components/DisclosureSummary';
import { DraftSaveIndicator, type DraftSaveState } from '@/components/DraftSaveIndicator';
import { UseNotice } from '@/components/LegalFooter';
import { SpreadsheetIcon } from '@/components/icons';
import { Alert, Badge, Card, Button, PageHeader, RequiredNote, SelectField, TextAreaField, TextField } from '@/components/ui';
import { LoadingRegion, SkeletonHeader, SkeletonTable } from '@/components/Skeleton';
import { optionalNumber, shiftDate } from '@/domain/nutrition';
import { NutritionDailyEntry } from './NutritionDailyEntry';
import { draftFromRevision, NutritionProgramDraft, nutritionHasUnpublishedChanges, nutritionPublishProblems, startingPrediction, type NutritionProgramSnapshot } from '@/domain/nutritionProgram';
import { formatDate, formatDateTime } from '@/lib/format';
import { nutritionError } from './api';
import { fetchNutritionProgram, nutritionProgramKey, publishNutritionProgram, saveNutritionDraft, useNutritionProgram } from './programApi';
import { NutritionSpreadsheet, nutritionNumber } from './NutritionSpreadsheet';

export function NutritionProgramPage({ coach = false, published = false, id, embedded = false }: { coach?: boolean; published?: boolean; id?: string; embedded?: boolean }) {
  const { programId: routeProgramId, clientId } = useParams();
  const programId=id ?? routeProgramId;
  const query = useNutritionProgram(programId, published);
  if (query.isPending) return <LoadingRegion label="Loading nutritional program"><SkeletonHeader subtitle /><SkeletonTable /></LoadingRegion>;
  if (!query.data) return <div className="grid gap-4"><Alert title="Could not load nutritional program">{nutritionError(query.error)}</Alert><Button variant="secondary" onClick={() => void query.refetch()}>Retry</Button><Link className="link" to={coach ? `/coach/clients/${clientId}` : '/nutrition'}>Back to {coach ? 'client' : 'Nutrition'}</Link></div>;
  return <><Alert visible={!!query.error} title="Could not refresh the program">Your last loaded data is still shown. <button type="button" className="link" onClick={() => void query.refetch()}>Retry refresh</button></Alert><NutritionWorkspace key={`${programId}:${published}`} snapshot={query.data} coach={coach} published={published} embedded={embedded} /></>;
}

function NutritionWorkspace({ snapshot, coach, published, embedded }: { snapshot: NutritionProgramSnapshot; coach: boolean; published: boolean; embedded: boolean }) {
  const liveProgram = useNutritionProgram(coach && snapshot.current_revision_id ? snapshot.id : undefined, true);
  const location=useLocation();
  const from=location.state as {backTo?:string;backLabel?:string} | null;
  const cache = useQueryClient();
  const [revision, setRevision] = useState(snapshot.revision);
  const [base, setBase] = useState(() => draftFromRevision(snapshot.revision));
  const [draft, setDraft] = useState(base);
  const [formError, setFormError] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [dirtyWeeks, setDirtyWeeks] = useState<Record<number, boolean>>({});
  const lastServerRevision = useRef(`${snapshot.revision.id}:${snapshot.revision.lock_version}:${snapshot.revision.status}`);
  const draftDirty = JSON.stringify(draft) !== JSON.stringify(base);
  const cellsDirty = Object.values(dirtyWeeks).some(Boolean);
  const trackDirty = useCallback((week: number, dirty: boolean) => setDirtyWeeks((old) => old[week] === dirty ? old : { ...old, [week]: dirty }), []);
  const save = useMutation({ mutationFn: ({ value, version }: { value: NutritionProgramDraft; version: number | null }) => saveNutritionDraft(snapshot.id, version, value),
    onSuccess: async (result, sent) => {
      setRevision(result); const saved = draftFromRevision(result); setBase(saved);
      // Typing stays enabled during a save. Only replace the form if it still matches that request.
      setDraft((current) => JSON.stringify(current) === JSON.stringify(sent.value) ? saved : current);
      setFormError('');
      await Promise.all([cache.invalidateQueries({ queryKey: ['programs'] }), cache.invalidateQueries({ queryKey: nutritionProgramKey })]);
    } });
  const publish = useMutation({ mutationFn: () => publishNutritionProgram(snapshot.id, revision.lock_version), onSuccess: async () => {
    const fresh = await fetchNutritionProgram(snapshot.id, published);
    setRevision(fresh.revision); const saved = draftFromRevision(fresh.revision); setBase(saved); setDraft(saved); setReviewing(false);
    await Promise.all([cache.invalidateQueries({ queryKey: nutritionProgramKey }), cache.invalidateQueries({ queryKey: ['programs'] }), cache.invalidateQueries({ queryKey: ['nutrition'] })]);
  } });
  const busy = save.isPending || publish.isPending;
  useEffect(() => {
    const incoming = snapshot.revision;
    const signature = `${incoming.id}:${incoming.lock_version}:${incoming.status}`;
    if (lastServerRevision.current === signature || draftDirty || cellsDirty || busy) return;
    lastServerRevision.current = signature;
    setRevision(incoming);
    const latest = draftFromRevision(incoming); setBase(latest); setDraft(latest);
  }, [snapshot.revision, draftDirty, cellsDirty, busy]);
  const unsaved = draftDirty || cellsDirty || busy;
  const blocker = useBlocker(({ currentLocation, nextLocation }) => unsaved && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsaved]);
  function retrySave() {
    if (save.isPending || publish.isPending || cellsDirty || !snapshot.can_edit || published) return;
    const parsed = NutritionProgramDraft.safeParse(draft);
    if (!parsed.success) { setFormError(parsed.error.issues.map((issue) => `${issue.path.join(' ')}: ${issue.message}`).join(' ')); return; }
    save.mutate({ value: parsed.data, version: revision.status === 'draft' ? revision.lock_version : null });
  }
  const editable = snapshot.can_edit && !published;
  const mutateDraft = save.mutate;
  useEffect(() => {
    if (!editable || !draftDirty || save.isPending || save.isError || publish.isPending || cellsDirty) return;
    const parsed = NutritionProgramDraft.safeParse(draft);
    if (!parsed.success) return;
    // Match the training editor: save one second after the last change, then pick up queued edits.
    const timer = setTimeout(() => mutateDraft({ value: parsed.data, version: revision.status === 'draft' ? revision.lock_version : null }), 1000);
    return () => clearTimeout(timer);
  }, [editable, draftDirty, draft, save.isPending, save.isError, publish.isPending, cellsDirty, revision.status, revision.lock_version, mutateDraft]);
  function changeDraft(patch: Partial<NutritionProgramDraft>) {
    setDraft((current) => ({ ...current, ...patch })); setFormError('');
    if (save.isError && (save.error as { code?: string })?.code !== 'PT409') save.reset();
    if (publish.isError) publish.reset();
  }
  async function reloadDraft() {
    try {
      const fresh = await fetchNutritionProgram(snapshot.id, published);
      setRevision(fresh.revision); const latest = draftFromRevision(fresh.revision); setBase(latest); setDraft(latest); setFormError(''); save.reset(); publish.reset();
      await cache.invalidateQueries({ queryKey: [...nutritionProgramKey, snapshot.id] });
    } catch (error) { setFormError(nutritionError(error)); }
  }
  const problems = nutritionPublishProblems(draft);
  const parsedDraft = NutritionProgramDraft.safeParse(draft);
  const validationError = draftDirty && !parsedDraft.success ? parsedDraft.error.issues.map((issue) => `${issue.path.join(' ')}: ${issue.message}`).join(' ') : '';
  const saveState: DraftSaveState = save.isPending ? 'saving' : save.isError ? (save.error as { code?: string })?.code === 'PT409' ? 'conflict' : 'error' : draftDirty ? 'unsaved' : 'saved';
  const preview = parsedDraft.success ? parsedDraft.data : base;
  const hasUnpublishedChanges = parsedDraft.success && (!snapshot.current_revision_id
    || !!liveProgram.data && nutritionHasUnpublishedChanges(parsedDraft.data, draftFromRevision(liveProgram.data.revision)));
  const sheetSnapshot = { ...snapshot, revision,
    can_log: snapshot.can_log && (coach || revision.id === snapshot.current_revision_id) && !draftDirty,
  };
  const overlapEnd = preview.start_date ? new Date(`${preview.start_date}T12:00:00Z`) : null;
  if (overlapEnd) overlapEnd.setUTCDate(overlapEnd.getUTCDate() + preview.week_count * 7 - 1);
  const overlaps = snapshot.overlaps.filter((p) => preview.start_date && p.start_date <= overlapEnd!.toISOString().slice(0, 10) && p.end_date >= preview.start_date);
  const dailyActive=!coach && snapshot.can_log && revision.start_date !== null && revision.start_date<=snapshot.today && shiftDate(revision.start_date,revision.week_count*7-1)>=snapshot.today;
  useEffect(() => {
    if (location.hash.startsWith('#nutrition-day-')) document.getElementById(location.hash.slice(1))?.scrollIntoView({block:'center'});
  },[location.hash]);

  return <div className="grid min-w-0 gap-5">
    {!embedded ? <Link to={coach ? from?.backTo ?? `/coach/clients/${snapshot.client_id}` : '/nutrition'} className="-my-3 inline-flex min-h-11 w-fit items-center gap-1.5 text-sm text-muted hover:text-text"><span aria-hidden>←</span>{coach ? from?.backLabel ?? snapshot.client_name : 'Nutrition'}</Link> : null}
    <PageHeader title={embedded ? 'Nutrition' : draft.program_style.trim() || 'Untitled nutritional program'} subtitle={coach ? snapshot.client_name : embedded ? draft.program_style : 'Nutritional programming'} actions={<div className="flex flex-wrap items-center gap-2">
      {snapshot.archived_at ? <Badge>Archived</Badge> : revision.status === 'draft' ? <Badge>Draft · staff only</Badge> : <Badge tone="gold">Live</Badge>}
      {editable && snapshot.can_publish ? <Button disabled={publish.isPending || cellsDirty || !hasUnpublishedChanges || problems.length > 0} busy={publish.isPending} onClick={() => setReviewing(true)}>Publish</Button> : null}
    </div>} />
    {dailyActive ? <NutritionDailyEntry key={revision.id} snapshot={sheetSnapshot} onDirty={trackDirty} /> : null}
    {coach ? <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3 text-sm">{editable ? <DraftSaveIndicator state={saveState} onRetry={retrySave} /> : <span className="text-muted">Published program</span>}
      {snapshot.current_revision_id ? <Link className="inline-flex min-h-11 items-center gap-1.5 rounded-card border border-line px-4 text-sm font-medium hover:border-muted/70" to={`/coach/clients/${snapshot.client_id}/nutrition/${snapshot.id}${published ? '' : '/log'}`}>{published ? 'Edit program' : 'Client spreadsheet'} <span aria-hidden>→</span></Link> : null}</div> : null}
    {overlaps.length ? <Alert tone="note" title="Overlapping nutritional programs">This program overlaps {overlaps.map((p) => p.program_style.trim() || 'Untitled nutritional program').join(', ')}. You can keep both. Daily entries for the same dates are shared.</Alert> : null}
    {snapshot.archived_at ? <Alert tone="note">This program is archived. Its spreadsheet and saved history are read-only.</Alert> : null}
    {snapshot.revision.id !== revision.id && cellsDirty && !busy ? <Alert tone="note">The program changed while you had unsaved entries. Discard those entries to load the current program, then enter them again.</Alert> : null}
    {revision.status === 'draft' ? <Alert tone="note">Program details stay private until published. Coach edits to daily entries save immediately to the client’s records.</Alert> : null}
    <Alert visible={!!formError || !!validationError || !!save.error || !!publish.error} title="Program not saved">{formError || validationError || nutritionError(save.error ?? publish.error)}</Alert>
    {save.error || publish.error ? <div><Button variant="secondary" disabled={busy} onClick={() => void reloadDraft()}>Discard program edits and reload</Button></div> : null}
    {editable ? <fieldset disabled={publish.isPending || cellsDirty} className="grid min-w-0 gap-4">
      <div><h2 className="text-lg font-semibold">Program details</h2><RequiredNote className="mt-1" /></div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_8rem_8rem]">
        <TextField label="Program Style" required maxLength={160} value={draft.program_style} onChange={(e) => changeDraft({ program_style: e.target.value })} />
        <TextField label="Start Date" required type="date" min="1900-01-01" max="9998-01-01" value={draft.start_date ?? ''} onChange={(e) => changeDraft({ start_date: e.target.value || null })} />
        <SelectField label="Weight unit" value={draft.weight_unit} onChange={(e) => changeDraft({ weight_unit: e.target.value as 'lb' | 'kg' })}><option value="lb">lb</option><option value="kg">kg</option></SelectField>
        <TextField label="Weeks" required type="number" min={1} max={52} step={1} value={draft.week_count} onChange={(e) => changeDraft({ week_count: Number(e.target.value) })} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <TextField label="Starting Predicted Maintenance Calories" required type="number" min={0} max={30000} step={1} value={draft.maintenance ?? ''} onChange={(e) => changeDraft({ maintenance: optionalNumber(e.target.value) })} />
        <TextField label="Starting Predicted Daily Caloric Goal" required type="number" min={0} max={30000} step={1} value={draft.calorie_goal ?? ''} onChange={(e) => changeDraft({ calorie_goal: optionalNumber(e.target.value) })} />
        <div className="grid content-start gap-1.5"><p className="text-sm font-medium">Starting Predicted Weight Change Per Week</p><output className="flex min-h-11 items-center rounded-card border border-line bg-surface-raised px-3 text-base tabular-nums">{nutritionNumber(startingPrediction(draft), 2)} <span className="ml-1 text-sm text-muted">{draft.weight_unit} · estimate</span></output></div>
      </div>
      <TextAreaField label="Program notes" rows={2} maxLength={5000} value={draft.notes} onChange={(e) => changeDraft({ notes: e.target.value })} />
    </fieldset> : <ReadonlyDetails draft={draft} />}
    {published && coach && snapshot.can_log ? <Alert tone="note">Client spreadsheet. Your changes are recorded as coach corrections.</Alert> : null}
    <h2 className="flex min-h-11 items-center gap-2 border-b border-line text-sm font-medium text-gold-fg"><SpreadsheetIcon /> Spreadsheet</h2>
    <NutritionSpreadsheet snapshot={sheetSnapshot} draft={preview} onDirty={trackDirty} />
    <p className="text-xs text-muted/60">Calorie balance = calories consumed − caloric output. Predicted weight change uses 3,500 kcal per lb and is an estimate. Average Weight uses up to seven days, with at least three weigh-ins. Weekly changes compare weekly averages; Week 1 compares against the first recorded weigh-in.</p>
    {coach ? <CorrectionHistory snapshot={snapshot} /> : null}
    {!coach && !embedded ? <UseNotice className="mt-4 border-t border-line pt-6" /> : null}
    {reviewing ? <Dialog title="Publish nutritional program?" description="Publishing makes these program details available to the client. Existing daily entries remain saved against their original dates." onClose={() => { if (!publish.isPending) setReviewing(false); }} footer={<>
      <Button variant="secondary" disabled={publish.isPending} onClick={() => setReviewing(false)}>Keep editing</Button>
      <Button busy={publish.isPending} disabled={!hasUnpublishedChanges || draftDirty || save.isPending || save.isError || problems.length > 0 || revision.status !== 'draft'} onClick={() => publish.mutate()}>Publish program</Button>
    </>}><div className="grid gap-3 p-4 sm:p-5"><p className="font-medium">{draft.program_style || 'Untitled nutritional program'}</p><p className="text-sm text-muted">{draft.start_date ? formatDate(draft.start_date) : 'No Start Date'} · {draft.week_count} weeks</p>
      {draftDirty || save.isPending ? <Alert tone="note">Draft changes save automatically. Publishing will be available once they are saved.</Alert> : null}
      {save.isError ? <Alert>Draft changes could not be saved. Close this review and resolve the save error before publishing.</Alert> : null}
      {problems.length ? <ul className="list-inside list-disc text-sm text-danger">{problems.map((problem) => <li key={problem}>{problem}</li>)}</ul> : null}
      {overlaps.length ? <Alert tone="note">This program overlaps another nutritional program. Publishing is allowed.</Alert> : null}
      <Alert visible={!!publish.error}>{nutritionError(publish.error)}</Alert>
    </div></Dialog> : null}
    {blocker.state === 'blocked' ? <Dialog title="Leave with unsaved edits?" description="Your unsaved program details or spreadsheet entries will be discarded." onClose={() => blocker.reset()} footer={<><Button variant="secondary" onClick={() => blocker.reset()}>Keep editing</Button><Button variant="danger" disabled={busy} onClick={() => blocker.proceed()}>Leave page</Button></>}><p className="p-4 text-sm text-muted">Save your edits before leaving if you want to keep them.</p></Dialog> : null}
  </div>;
}

function ReadonlyDetails({ draft }: { draft: NutritionProgramDraft }) {
  return <section className="grid gap-4"><h2 className="text-lg font-semibold">Program details</h2>
    <p className="text-sm text-muted">Start Date {draft.start_date ? formatDate(draft.start_date) : '—'} · {draft.week_count} weeks</p>
    <Card as="dl" className="grid gap-5 lg:grid-cols-3">
      <div><dt className="text-sm text-muted">Weight unit</dt><dd className="mt-2 text-xl font-medium">{draft.weight_unit}</dd></div>
      <div><dt className="text-sm text-muted">Starting Predicted Maintenance Calories</dt><dd className="mt-2 text-xl font-medium tabular-nums">{nutritionNumber(draft.maintenance, 0)} <span className="text-sm text-muted">kcal</span></dd></div>
      <div><dt className="text-sm text-muted">Starting Predicted Daily Caloric Goal</dt><dd className="mt-2 text-xl font-medium tabular-nums">{nutritionNumber(draft.calorie_goal, 0)} <span className="text-sm text-muted">kcal</span></dd></div>
      <div><dt className="text-sm text-muted">Starting Predicted Weight Change Per Week</dt><dd className="mt-2 text-xl font-medium tabular-nums">{nutritionNumber(startingPrediction(draft), 2)} <span className="text-sm text-muted">{draft.weight_unit} · estimate</span></dd></div>
    </Card>
    {draft.notes ? <p className="whitespace-pre-wrap break-words text-sm">{draft.notes}</p> : null}
  </section>;
}
function CorrectionHistory({ snapshot }: { snapshot: NutritionProgramSnapshot }) {
  const changes = snapshot.changes.filter((change) => change.before_value !== null);
  if (!changes.length) return null;
  const describe = (value: unknown, kind: string) => {
    const v = value as Record<string, unknown>;
    return kind === 'weight' ? `${v.weight ?? '—'} ${v.unit}` : `Intake: ${v.intake ?? '—'} kcal; output: ${v.output ?? '—'} kcal${v.notes ? `; ${v.notes}` : ''}`;
  };
  return (
    <details className="rounded-card border border-line px-4 py-2">
      <DisclosureSummary className="cursor-pointer list-none font-medium">Correction history</DisclosureSummary>
      <p className="text-xs text-muted">Latest 100 saves within this program’s dates.</p>
      <ul className="mt-2 mb-2 divide-y divide-line">
        {changes.map((change) => (
          <li key={change.id} className="py-3 text-sm">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-medium">{formatDate(change.entry_date)} · {change.kind === 'weight' ? 'Weight' : 'Calorie activity'}</span>
              <Badge tone={change.by_staff ? 'gold' : 'neutral'}>{change.by_staff ? 'Coach correction' : 'Client correction'}</Badge>
            </div>
            <p className="mt-1 text-xs text-muted"><time dateTime={change.created_at}>{formatDateTime(change.created_at)}</time></p>
            <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-card border border-line bg-surface p-3">
              <dt className="text-muted">Before</dt>
              <dd className="whitespace-pre-wrap break-words">{describe(change.before_value, change.kind)}</dd>
              <dt className="text-muted">After</dt>
              <dd className="whitespace-pre-wrap break-words">{describe(change.after_value, change.kind)}</dd>
            </dl>
          </li>
        ))}
      </ul>
    </details>
  );
}
