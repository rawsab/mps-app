import { Link, useLocation, useParams, useSearchParams } from 'react-router';
import { DisclosureSummary } from '@/components/DisclosureSummary';
import { UseNotice } from '@/components/LegalFooter';
import { CheckCircleIcon } from '@/components/icons';
import { Alert, Badge, Button, EmptyState, PageHeader, Spinner } from '@/components/ui';
import { dayView, locateDay, prescriptionView, weekSummaries, type DayBlock, type DayView } from '@/domain/programs/clientView';
import type { Exercise, ProgramDraft } from '@/domain/programs/contract';
import { programServiceIcon, programServiceIconStyle } from '@/features/programs/ProgramsCard';
import { formatDate } from '@/lib/format';
import { SERVICE_LABELS } from '@/lib/services';
import { isExerciseLogged, type TrainingSession } from '@/domain/training/volume';
import { logErrorMessage, trainingErrorMessage, usePublishedProgram, usePublishedPrograms, useStartSession, useTrainingLog } from './api';
import { ResourceBody } from './ResourceBody';
import { ExerciseSetLog, SessionDate, SessionWrapUp, SetTotals } from './SetLog';
import { StimulusFatigue } from './StimulusFatigue';

const programName = (title: string) => title.trim() || 'Your program';

/** The client's current published programs (M3 step 5). Drafts and archived programs never appear. */
export function TrainingPage() {
  const programs = usePublishedPrograms();
  return (
    <div>
      <PageHeader title="Training" />
      {programs.isPending ? <Spinner label="Loading programs" /> : null}
      <Alert visible={!!programs.error} title="Could not load your programs">{trainingErrorMessage(programs.error)}</Alert>
      {programs.data?.length === 0 ? (
        <EmptyState title="No program yet">Your coach hasn’t published a program for you. It will appear here once they do.</EmptyState>
      ) : null}
      {programs.data?.length ? (
        <ul className="divide-y divide-line">
          {programs.data.map((p) => (
            <li key={p.programId}>
              <Link to={`/training/${p.programId}`} className="row-link group flex min-h-16 items-center gap-3 rounded-card px-2 py-3 hover:bg-surface-raised">
                <span aria-hidden className={`grid size-9 shrink-0 place-items-center rounded-full [&>svg]:size-4 ${programServiceIconStyle(p.service)}`}>{programServiceIcon(p.service)}</span>
                <div className="min-w-0 flex-1">
                  <p className="break-words font-medium">{programName(p.title)}</p>
                  {p.service === 'mesocycle' && p.programTheme.trim() ? <p className="mt-0.5 break-words text-sm text-muted">{p.programTheme}</p> : null}
                  <p className="text-xs text-muted">
                    {SERVICE_LABELS[p.service]} · {p.weekCount} {p.weekCount === 1 ? 'week' : 'weeks'} · updated {formatDate(p.publishedAt)}
                  </p>
                </div>
                <span aria-hidden className="text-muted group-hover:text-text">→</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** The client's route. Coaches open the same view from the editor (see TrainingProgramView). */
export function TrainingProgramPage() {
  const { programId } = useParams();
  return <TrainingProgramView programId={programId!} backTo="/training" backLabel="Training" />;
}

/** Coach route: the client's published program and log, editable by staff with access (FR-07). */
export function CoachTrainingLogPage() {
  const { clientId, programId } = useParams();
  // Activity links pass where they came from; otherwise the log is reached from the editor.
  const from = useLocation().state as { backTo?: string; backLabel?: string } | null;
  return <TrainingProgramView programId={programId!} backTo={from?.backTo ?? `/coach/clients/${clientId}/programs/${programId}`}
    backLabel={from?.backLabel ? `Back to ${from.backLabel}` : 'Back to editor'} staff />;
}

/**
 * Week → day view of the current published revision. Selection lives in the URL so reloads keep it.
 * Mesocycles add set logging, set totals and optional Stimulus & Fatigue answers; a logged day shows its session's own revision.
 */
export function TrainingProgramView({ programId, backTo, backLabel, staff = false }: { programId: string; backTo: string; backLabel: string; staff?: boolean }) {
  const program = usePublishedProgram(programId);
  const logging = program.data?.service === 'mesocycle';
  const log = useTrainingLog(programId, logging);
  const [params, setParams] = useSearchParams();

  const back = <Link to={backTo} className="mb-4 inline-flex min-h-11 items-center gap-1 text-sm text-muted hover:text-text">← {backLabel}</Link>;
  if (program.isPending) return <div>{back}<Spinner label="Loading program" /></div>;
  if (program.error) return <div>{back}<Alert title="Could not open this program">{trainingErrorMessage(program.error)}</Alert></div>;

  const { document: doc, service, archivedAt, publishedAt } = program.data;
  const located = locateDay(doc, params.get('week'), params.get('day'));
  const select = (weekId: string, dayId: string | null) =>
    setParams(dayId ? { week: weekId, day: dayId } : { week: weekId }, { replace: true, preventScrollReset: true });

  return (
    <div>
      {back}
      <PageHeader
        title={programName(doc.title)}
        subtitle={<>
          {service === 'mesocycle' && doc.programTheme?.trim() ? <span className="block text-base text-text">{doc.programTheme}</span> : null}
          <span className="block">{SERVICE_LABELS[service]} · updated {formatDate(publishedAt)}</span>
        </>}
      />
      <Alert visible={!!staff} className="mb-4" tone="note" title="Client log">You’re viewing the published program as the client sees it. Changes you make are saved to the client’s record and marked as coach edits.</Alert>
      <Alert visible={!!archivedAt} className="mb-4" tone="info" title="Archived program">Your coach archived this program on {archivedAt ? formatDate(archivedAt) : ''}. It’s kept here for reference.</Alert>
      {doc.coachNotes.trim() ? <Notes title="Program notes" body={doc.coachNotes} /> : null}

      {located ? (
        <>
          <WeekPicker program={doc} weekId={located.week.id} onSelect={(weekId) => select(weekId, null)} />
          <DayPicker program={doc} weekId={located.week.id} dayId={located.day?.id ?? null} completed={new Set(log.data?.filter((s) => s.status === 'completed').map((s) => s.dayId))} onSelect={(dayId) => select(located.week.id, dayId)} />
          {located.day ? (() => {
            const session = log.data?.find((s) => s.dayId === located.day!.id) ?? null;
            // A started session keeps the day as prescribed when it began (its revision's snapshot).
            const week = session ? { ...located.week, useSections: session.useSections } : located.week;
            const day = session ? session.day : located.day;
            return <>
              {logging ? <LogHeader programId={programId} dayId={located.day.id} session={session} pending={log.isPending} error={log.error} archived={!!archivedAt} staff={staff} /> : null}
              {logging && session ? <SessionDate programId={programId} session={session} readOnly={false} /> : null}
              <Day view={dayView(doc, week, day)} log={logging && session ? { programId, session } : null} />
              {logging && log.data ? <SetTotals program={doc} sessions={log.data} dayId={located.day.id} /> : null}
              {logging && session && log.data ? <StimulusFatigue programId={programId} program={doc} sessions={log.data} session={session} staff={staff} /> : null}
              {logging && session ? <SessionWrapUp programId={programId} session={session} readOnly={false} /> : null}
            </>;
          })() : <p className="mt-6 text-sm text-muted">This week has no workouts.</p>}
        </>
      ) : (
        <EmptyState title="No workouts yet">This program doesn’t have any weeks yet.</EmptyState>
      )}

      {doc.resources.length ? <Resources program={doc} /> : null}
      <UseNotice className="mt-16 border-t border-line pt-6" />
    </div>
  );
}

function WeekPicker({ program, weekId, onSelect }: { program: ProgramDraft; weekId: string; onSelect: (id: string) => void }) {
  const weeks = weekSummaries(program);
  if (weeks.length < 2) return null;
  return (
    <div role="group" aria-label="Week" className="-mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4 pb-1">
      {weeks.map((w) => (
        <button key={w.id} type="button" aria-pressed={w.id === weekId} onClick={() => onSelect(w.id)}
          className={`min-h-11 shrink-0 rounded-full border px-4 text-sm transition-colors ${w.id === weekId ? 'border-gold/50 bg-gold/10 font-medium text-gold-fg' : 'border-line text-muted hover:bg-surface-raised hover:text-text'}`}>
          {w.name}
        </button>
      ))}
    </div>
  );
}

function DayPicker({ program, weekId, dayId, completed, onSelect }: { program: ProgramDraft; weekId: string; dayId: string | null; completed: Set<string>; onSelect: (id: string) => void }) {
  const week = weekSummaries(program).find((w) => w.id === weekId)!;
  if (week.days.length === 0) return null;
  return (
    <nav aria-label={`${week.name} days`} className="mb-6">
      <p className="mb-2 text-sm text-muted">{week.name}{week.startDate ? ` · starts ${formatDate(week.startDate)}` : ''}</p>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {week.days.map((d) => {
          const selected = d.id === dayId;
          const done = completed.has(d.id);
          // Completed days turn green (stronger when selected) and lead with a check.
          const tone = done
            ? selected ? 'border-success bg-success/15' : 'border-success/50 bg-success/10 hover:bg-success/15'
            : selected ? 'border-gold/50 bg-gold/10' : 'border-line hover:bg-surface-raised';
          return (
            <li key={d.id}>
              <button type="button" aria-current={selected ? 'true' : undefined} onClick={() => onSelect(d.id)}
                className={`flex min-h-14 w-full items-center gap-2.5 rounded-card border px-3 py-2 text-left transition-colors ${tone}`}>
                {done ? <span className="text-success"><CheckCircleIcon /></span> : null}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={`text-xs ${done ? 'text-success' : selected ? 'text-gold-fg' : 'text-muted'}`}>{d.name}{done ? <span className="sr-only"> (completed)</span> : null}</span>
                  <span className="w-full truncate text-sm font-medium">{d.focus || 'Workout'}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

type DayLog = { programId: string; session: TrainingSession } | null;

/** Start (or explain) the log for the selected day. */
function LogHeader({ programId, dayId, session, pending, error, archived, staff }: { programId: string; dayId: string; session: TrainingSession | null; pending: boolean; error: unknown; archived: boolean; staff: boolean }) {
  const start = useStartSession(programId);
  if (error) return <div className="mb-4"><Alert title="Could not load the workout log">{logErrorMessage(error)}</Alert></div>;
  if (pending || session) return null;
  if (archived) return <p className="mb-4 text-sm text-muted">This program is archived, so new workouts can’t be logged.</p>;
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface-raised p-3">
      <p className="text-sm">{staff ? 'The client hasn’t logged this day yet.' : 'Ready to train? Log your weight and reps for each set.'}</p>
      <Button busy={start.isPending} onClick={() => start.mutate(dayId)}>{staff ? 'Start log for client' : 'Log this workout'}</Button>
      {start.error ? <p role="alert" className="w-full text-xs text-danger">{logErrorMessage(start.error)}</p> : null}
    </div>
  );
}

function Day({ view, log }: { view: DayView; log: DayLog }) {
  return (
    <article aria-labelledby={`day-${view.id}`}>
      <header className="mb-4 border-b border-line pb-3">
        <h2 id={`day-${view.id}`} className="text-xl font-semibold">{view.name}{view.focus ? <span className="text-muted"> · {view.focus}</span> : null}</h2>
        {view.scheduledDate ? <p className="mt-1 text-sm text-muted">{formatDate(view.scheduledDate)}</p> : null}
      </header>
      {view.before.map((b) => <Block key={b.id} block={b} shared log={null} />)}
      {view.blocks.map((b) => <Block key={b.id} block={b} log={log} />)}
      {view.exerciseCount === 0 ? <p className="mb-6 text-sm text-muted">No exercises for this day.</p> : null}
      {view.after.map((b) => <Block key={b.id} block={b} shared log={null} />)}
    </article>
  );
}

function Block({ block, shared, log }: { block: DayBlock; shared?: boolean; log: DayLog }) {
  const body = (
    <>
      {block.instructions ? <p className="mb-3 whitespace-pre-line text-sm text-muted">{block.instructions}</p> : null}
      <ol className="grid gap-3">
        {block.groups.map((g) => g.superset ? (
          <li key={g.key} className={`rounded-card border bg-surface p-3 ${boxBorder(g.exercises, log)}`}>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gold-fg">Superset · do these back to back</p>
            <ol className="grid divide-y divide-line">{g.exercises.map((e) => <li key={e.id} className="py-2 first:pt-0 last:pb-0"><ExerciseItem exercise={e} log={log} /></li>)}</ol>
          </li>
        ) : (
          <li key={g.key} className={`rounded-card border bg-surface p-3 ${boxBorder(g.exercises, log)}`}><ExerciseItem exercise={g.exercises[0]!} log={log} /></li>
        ))}
      </ol>
    </>
  );
  // Every-workout sections repeat on each day, so they start collapsed.
  if (shared) {
    return (
      <details className="mb-6 rounded-card bg-surface-raised px-3">
        <DisclosureSummary className="flex min-h-11 cursor-pointer list-none items-center gap-2 py-2 font-medium [&::-webkit-details-marker]:hidden">
          {block.title || 'Every workout'}<span className="text-xs font-normal text-muted">every workout</span>
        </DisclosureSummary>
        <div className="pb-3">{body}</div>
      </details>
    );
  }
  return (
    <section className="mb-6">
      {block.title ? <h3 className="mb-2 font-semibold">{block.title}</h3> : null}
      {body}
    </section>
  );
}

const exerciseLogged = (exercise: Exercise, log: DayLog) => !!log && isExerciseLogged(exercise, log.session.sets);

/** A box turns green once every exercise in it is logged. */
const boxBorder = (exercises: readonly Exercise[], log: DayLog) =>
  exercises.every((e) => exerciseLogged(e, log)) ? 'border-success/50' : 'border-line';

function ExerciseItem({ exercise, log }: { exercise: Exercise; log: DayLog }) {
  const p = prescriptionView(exercise.prescription);
  const logged = exerciseLogged(exercise, log);
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="flex min-w-0 items-center gap-2 break-words font-medium">
          {logged ? <span className="text-success"><CheckCircleIcon /></span> : null}
          {exercise.name}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {logged ? <Badge tone="success">Logged</Badge> : null}
          {p.sets ? <p className="text-sm text-muted">{p.sets}</p> : null}
        </div>
      </div>
      {exercise.alternatives.length ? <p className="mt-0.5 break-words text-sm text-muted">Or: {exercise.alternatives.map((a) => a.name).join(', ')}</p> : null}
      {p.lines.length ? (
        <dl className="mt-1.5 grid gap-0.5 text-sm">
          {p.lines.map((line, i) => (
            <div key={i} className="flex gap-2">
              {line.label ? <dt className="w-12 shrink-0 text-muted">{line.label}</dt> : <dt className="sr-only">Target</dt>}
              <dd className="min-w-0 break-words">{line.text}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {exercise.notes.trim() ? <p className="mt-1.5 whitespace-pre-line break-words text-sm text-muted">{exercise.notes}</p> : null}
      {exercise.demoUrl ? (
        <a href={exercise.demoUrl} target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-flex min-h-11 items-center text-sm text-gold-fg underline-offset-2 hover:underline">
          Watch demo<span aria-hidden> ↗</span><span className="sr-only"> (opens in a new tab)</span>
        </a>
      ) : null}
      {log ? <ExerciseSetLog programId={log.programId} session={log.session} exercise={exercise} readOnly={false} /> : null}
    </div>
  );
}

function Notes({ title, body }: { title: string; body: string }) {
  return (
    <details className="mb-6 rounded-card border border-line px-3">
      <DisclosureSummary className="flex min-h-11 cursor-pointer list-none items-center gap-2 py-2 font-medium [&::-webkit-details-marker]:hidden">{title}</DisclosureSummary>
      <p className="whitespace-pre-line break-words pb-3 text-sm">{body}</p>
    </details>
  );
}

function Resources({ program }: { program: ProgramDraft }) {
  return (
    <section aria-labelledby="program-resources" className="mt-8 border-t border-line pt-4">
      <h2 id="program-resources" className="mb-3 text-lg font-semibold">Resources</h2>
      <ul className="grid gap-8">
        {program.resources.map((r) => (
          <li key={r.id}>
            {r.url ? (
              <a href={r.url} target="_blank" rel="noopener noreferrer" className="font-medium text-gold-fg underline-offset-2 hover:underline">
                {r.title}<span aria-hidden> ↗</span><span className="sr-only"> (opens in a new tab)</span>
              </a>
            ) : <p className="font-medium">{r.title}</p>}
            {r.body.trim() ? <ResourceBody body={r.body} label={r.title} /> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
