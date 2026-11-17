import { useId, useState, type DragEvent, type FormEvent, type ReactNode } from 'react';
import { z } from 'zod';
import { useSearchParams } from 'react-router';
import { DayIcon, PlusIcon, TrainingIcon } from '@/components/icons';
import { ActionsMenu, actionItemClass } from '@/components/ActionsMenu';
import { programDestinations, selectedProgramItem } from './programNavigation';
import { DisclosureSummary } from '@/components/DisclosureSummary';
import { Dialog } from '@/components/Dialog';
import { Button } from '@/components/ui';
import { newDay, newExercise, newResource, newSection, newWeek, type DraftCommand } from '@/domain/programs/commands';
import { dayFocus, dayHeading, dayName, weekName } from '@/domain/programs/labels';
import type { Exercise, ProgramWeek, Section, WorkoutDay } from '@/domain/programs/contract';
import { cellText, gridRows, LOAD_MODE_OPTIONS, type GridColumnKey, type GridRow } from '@/domain/programs/grid';
import {
  cellKey,
  CommitField,
  CommitSelect,
  CopyGlyph,
  DownGlyph,
  RemoveGlyph,
  UpGlyph,
  useCellCommit,
  useCommandCommit,
} from './fields';
import { useEditor } from './useDraftEditor';
import { weekMuscles } from '@/domain/programs/muscles';
import { planGridRowMove, type GridRowDrop } from '@/domain/programs/gridRowMoves';

/**
 * Matt's Program view (FR-05): an outline and one focused workout workspace. It edits
 * through the same commands and cell parsing as the Grid, so both views always show the same draft.
 */

type Removal = { id: string; what: string };

export function ProgramView({ readOnly = false }: { readOnly?: boolean }) {
  const editor = useEditor();
  const commit = useCommandCommit();
  const { draft } = editor;
  const [removal, setRemoval] = useState<Removal | null>(null);
  const [draggedExercise, setDraggedExercise] = useState<string | null>(null);
  const startExerciseDrag = (event: DragEvent<HTMLElement>, id: string) => {
    if (readOnly) { event.preventDefault(); return; }
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id);
    setDraggedExercise(id);
  };
  const dropExercise = (event: DragEvent<HTMLElement>, target: GridRowDrop) => {
    const id = event.dataTransfer.getData('text/plain') || draggedExercise;
    if (!id) return;
    event.preventDefault();
    event.stopPropagation();
    const plan = planGridRowMove(editor.draft, id, target);
    if (plan.commands.length) editor.dispatch(plan.commands);
    setDraggedExercise(null);
  };
  // Row positions for exercises, so the Program view numbers them like the Grid.
  const rows = new Map(gridRows(draft).map((r) => [r.exerciseId, r]));

  const [params, setParams] = useSearchParams();
  const selected = selectedProgramItem(draft, params.get('item'));
  const selectedWeek = draft.weeks.find((week) => week.id === selected || week.days.some((day) => day.id === selected));
  const selectedDay = selectedWeek?.days.find((day) => day.id === selected);
  const navigate = (item: string) => setParams((previous) => {
    const next = new URLSearchParams(previous);
    next.set('item', item);
    next.delete('focus');
    return next;
  }, { replace: true });
  const addWeek = () => {
    const week = newWeek(`Week ${draft.weeks.length + 1}`);
    if (!commit({ type: 'insert', parentId: null, node: week })) navigate(week.value.id);
  };
  const addDay = (week: ProgramWeek) => {
    const day = newDay('');
    if (!commit({ type: 'insert', parentId: week.id, node: day })) navigate(day.value.id);
  };
  const issueCount = (ids: string[]) => Object.keys(editor.state.rejected).filter((key) => ids.some((id) => key.startsWith(`${id}:`))).length;
  const outlineButton = (id: string, label: ReactNode, count?: number, issues = 0) => (
    <button type="button" aria-current={selected === id ? 'page' : undefined} onClick={() => navigate(id)}
      className={`flex min-h-11 w-full min-w-0 items-center justify-between gap-2 rounded-card px-3 py-1.5 text-left text-sm transition-colors ${selected === id ? 'bg-gold/10 font-medium text-text' : 'text-muted hover:bg-surface-raised hover:text-text'}`}>
      <span className="min-w-0 break-words">{label}</span>
      {issues > 0 ? <span className="shrink-0 text-xs text-danger">{issues} invalid</span> : count !== undefined ? <span className="text-xs tabular-nums text-muted">{count}</span> : null}
    </button>
  );
  const required = (what: string) => (text: string) => (text.trim() === '' ? `${what} can't be blank` : null);

  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-8">
      <nav aria-label="Program outline" onMouseDown={(event) => {
        if ((event.target as HTMLElement).closest('button')) event.preventDefault();
      }} onClickCapture={(event) => {
        (event.target as HTMLElement).closest<HTMLButtonElement>('button')?.focus();
      }} className="min-w-0 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:self-start lg:overflow-y-auto lg:border-r lg:border-line lg:pr-4">
        <div className="lg:hidden">
          <label htmlFor="program-destination" className="sr-only">Program navigation</label>
          <select id="program-destination" className="min-h-11 w-full rounded-card border border-line bg-surface px-3 text-base" value={selected} onChange={(event) => navigate(event.target.value)}>
            {programDestinations(draft).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" disabled={readOnly} className="outline-add" onClick={addWeek}><PlusIcon /> Add week</button>
            {selectedWeek ? <button type="button" disabled={readOnly} className="outline-add" onClick={() => addDay(selectedWeek)}><PlusIcon /> Add day</button> : null}
          </div>
        </div>
        <div className="hidden lg:block">
          {outlineButton('details', 'Program details', undefined, issueCount(['program']))}
          {outlineButton('shared', 'Every-workout prep', draft.sharedSections.reduce((n, section) => n + section.exercises.length, 0), issueCount(draft.sharedSections.flatMap((section) => [section.id, ...section.exercises.map((exercise) => exercise.id)])))}
          <ul className="my-4 grid gap-3">
            {draft.weeks.map((week, w) => <li key={week.id}>
              {outlineButton(week.id, weekName(w), week.days.length, issueCount([week.id]))}
              <ul className="ml-3 border-l border-line pl-1">
                {week.days.map((day, d) => <li key={day.id}>{outlineButton(day.id, <span className="flex min-w-0 flex-col gap-0.5"><span>{dayName(d)}</span>{dayFocus(day) ? <span className="text-xs font-normal text-muted/85">{dayFocus(day)}</span> : null}</span>, day.sections.reduce((n, section) => n + section.exercises.length, 0), issueCount([day.id, ...day.sections.flatMap((section) => [section.id, ...section.exercises.map((exercise) => exercise.id)])]))}</li>)}
                <li><button type="button" disabled={readOnly} className="outline-add" aria-label={`Add day to ${weekName(w)}`} onClick={() => addDay(week)}><PlusIcon /> Add day</button></li>
              </ul>
            </li>)}
            <li><button type="button" disabled={readOnly} className="outline-add" onClick={addWeek}><PlusIcon /> Add week</button></li>
          </ul>
          {outlineButton('resources', 'Resources', draft.resources.length, issueCount(draft.resources.map((resource) => resource.id)))}
        </div>
      </nav>
      <fieldset disabled={readOnly} className="min-w-0">
      {selected === 'details' ? <Panel title="Program details">
        <ProgramDetailsFields />
      </Panel> : null}

      {selected === 'shared' ? <Panel
        title="Every-workout preparation"
        description="Warm-ups or mobility the client does before every workout."
        footer={<AddSection parentId={null} />}
      >
        {draft.sharedSections.length === 0 ? <p className="text-sm text-muted">None yet.</p> : null}
        <div className="grid gap-3">
          {draft.sharedSections.map((section, i) => (
            <SectionEditor key={section.id} section={section} parentId={null} index={i} count={draft.sharedSections.length} rows={rows} onRemove={setRemoval} canDrag={!readOnly} draggedExercise={draggedExercise} onExerciseDragStart={startExerciseDrag} onExerciseDrop={dropExercise} onExerciseDragEnd={() => setDraggedExercise(null)} />
          ))}
        </div>
      </Panel> : null}

      {selectedWeek && !selectedDay ? <WeekEditor key={selectedWeek.id} week={selectedWeek} index={draft.weeks.indexOf(selectedWeek)} count={draft.weeks.length} onRemove={setRemoval} onNavigate={navigate} /> : null}
      {selectedWeek && selectedDay ? <div key={selectedDay.id}>
        <button type="button" onClick={() => navigate(selectedWeek.id)} className="mb-2 inline-flex min-h-11 items-center text-sm text-muted hover:text-text">{weekName(draft.weeks.indexOf(selectedWeek))} / Week settings</button>
        <h2 className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xl font-semibold">
          <span className="inline-flex shrink-0 items-center gap-2"><DayIcon />{dayName(selectedWeek.days.indexOf(selectedDay))}</span>
          {dayFocus(selectedDay) ? <span className="min-w-0 break-words text-sm font-normal text-muted/85">{dayFocus(selectedDay)}</span> : null}
        </h2>
        <DayEditor day={selectedDay} weekId={selectedWeek.id} index={selectedWeek.days.indexOf(selectedDay)} count={selectedWeek.days.length} rows={rows} onRemove={setRemoval} useSections={selectedWeek.useSections} canDrag={!readOnly} draggedExercise={draggedExercise} onExerciseDragStart={startExerciseDrag} onExerciseDrop={dropExercise} onExerciseDragEnd={() => setDraggedExercise(null)} />
      </div> : null}

      {selected === 'resources' ? <Panel
        title="Resources"
        description="Guides and links the client can open from the program. Type a table as lines like | A | B |, with |---|---| under the header. Start a line with ## for a heading."
        footer={
          <Button variant="secondary" onClick={() => commit({ type: 'insert', parentId: null, node: newResource('New resource') })}>
            <PlusIcon /> Add resource
          </Button>
        }
      >
        {draft.resources.length === 0 ? <p className="text-sm text-muted">None yet.</p> : null}
        <ul className="grid gap-3">
          {draft.resources.map((r, i) => (
            <li key={r.id} className="grid gap-3 border-b border-line py-4 sm:grid-cols-[1fr_1fr_auto]">
              <CommitField label="Title" value={r.title} rejectKey={`${r.id}:title`} onCommit={(t) => required('Title')(t) ?? commit({ type: 'updateResource', id: r.id, patch: { title: t.trim() } })} />
              <CommitField label="Link" type="url" inputMode="url" value={r.url ?? ''} rejectKey={`${r.id}:url`} placeholder="https://" onCommit={(t) => commitUrl(t, (url) => commit({ type: 'updateResource', id: r.id, patch: { url } }))} />
              <NodeActions id={r.id} index={i} count={draft.resources.length} parentId={null} what={`resource “${r.title}”`} onRemove={setRemoval} />
              <CommitField label="Text" value={r.body} rejectKey={`${r.id}:body`} multiline className="sm:col-span-3" onCommit={(t) => commit({ type: 'updateResource', id: r.id, patch: { body: t } })} />
            </li>
          ))}
        </ul>
      </Panel> : null}
      </fieldset>

      {removal ? (
        <Dialog
          title={`Remove ${removal.what}?`}
          description="It is removed from this draft only. Published programs and client history are unchanged."
          onClose={() => setRemoval(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setRemoval(null)}>
                Keep it
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  commit({ type: 'remove', id: removal.id });
                  setRemoval(null);
                }}
              >
                Remove
              </Button>
            </>
          }
        >
          <span />
        </Dialog>
      ) : null}
    </div>
  );
}

function commitUrl(text: string, apply: (url: string | null) => string | null): string | null {
  const t = text.trim();
  if (t === '') return apply(null);
  if (!z.url().safeParse(t).success || !/^https?:\/\//i.test(t)) return 'Enter a full link starting with https://';
  return apply(t);
}

function Panel({ title, description, children, footer }: { title: string; description?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <section className="min-w-0">
      <h2 className="text-xl font-semibold">{title}</h2>
      {description ? <p className="mb-5 mt-1 text-sm text-muted">{description}</p> : <div className="mb-3" />}
      {children}
      {footer ? <div className="mt-3">{footer}</div> : null}
    </section>
  );
}

/** Up, down, duplicate and remove for any node, by stable id. */
function NodeActions({
  id,
  index,
  count,
  parentId,
  what,
  onRemove,
  duplicable = true,
}: {
  id: string;
  index: number;
  count: number;
  parentId: string | null;
  what: string;
  onRemove: (r: Removal) => void;
  duplicable?: boolean;
}) {
  const commit = useCommandCommit();
  return (
    <ActionsMenu label={`Options for ${what}`}>
      <button type="button" className={actionItemClass} disabled={index === 0} onClick={() => commit({ type: 'move', id, parentId, index: index - 1 })}><UpGlyph /> Move up</button>
      <button type="button" className={actionItemClass} disabled={index === count - 1} onClick={() => commit({ type: 'move', id, parentId, index: index + 1 })}><DownGlyph /> Move down</button>
      {duplicable ? <button type="button" className={actionItemClass} onClick={() => commit({ type: 'duplicate', id })}><CopyGlyph /> Duplicate</button> : null}
      <button type="button" className={`${actionItemClass} text-danger`} onClick={() => onRemove({ id, what })}><RemoveGlyph /> Remove</button>
    </ActionsMenu>
  );
}

function WeekEditor({ week, index, count, onRemove, onNavigate }: { week: ProgramWeek; index: number; count: number; onRemove: (r: Removal) => void; onNavigate: (id: string) => void }) {
  const commit = useCommandCommit();
  const name = weekName(index);
  return (
    <Panel title={name} description="Week settings and workout days.">
      <div className="mb-6 flex flex-wrap items-end gap-3">

        <CommitField label="Starts" type="date" value={week.startDate ?? ''} rejectKey={`${week.id}:startDate`} className="w-full sm:w-44" onCommit={(t) => commit({ type: 'updateWeek', id: week.id, patch: { startDate: t || null } })} />
        <div className="flex min-h-11 items-center gap-2 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" className="size-4 accent-[var(--color-gold)]" checked={week.useSections} onChange={(event) => commit({ type: 'updateWeek', id: week.id, patch: { useSections: event.target.checked } })} />Use sections</label>
          <SectionsInfo />
        </div>
        <NodeActions id={week.id} index={index} count={count} parentId={null} what={name} onRemove={onRemove} />
      </div>
      <h3 className="text-base font-semibold">Workout days</h3>
      {week.days.length === 0 ? <p className="py-4 text-sm text-muted">Add the first workout day to this week.</p> : null}
      <ul className="mb-4 divide-y divide-line border-b border-line">
        {week.days.map((day, d) => <li key={day.id}><button type="button" onClick={() => onNavigate(day.id)} className="flex min-h-14 w-full items-center justify-between gap-3 py-3 text-left text-sm hover:text-gold-fg">
          <span className="min-w-0 break-words font-medium"><span className="text-muted">{dayName(d)}</span>{dayFocus(day) ? <> · <span className="text-text">{dayFocus(day)}</span></> : null}</span><span className="shrink-0 text-muted">{day.sections.reduce((n, section) => n + section.exercises.length, 0)} exercises →</span>
        </button></li>)}
      </ul>
      <Button variant="secondary" onClick={() => {
        const day = newDay('');
        if (!commit({ type: 'insert', parentId: week.id, node: day })) onNavigate(day.value.id);
      }}><PlusIcon /> Add day</Button>
    </Panel>
  );
}

type ExerciseDragProps = { canDrag: boolean; draggedExercise: string | null; onExerciseDragStart: (event: DragEvent<HTMLElement>, id: string) => void; onExerciseDrop: (event: DragEvent<HTMLElement>, target: GridRowDrop) => void; onExerciseDragEnd: () => void };

function SectionsInfo() {
  const tooltipId = useId();
  return (
    <span className="group/sections-info relative inline-flex">
      <button type="button" aria-label="About sections" aria-describedby={tooltipId} className="inline-flex size-4 items-center justify-center rounded-full border border-muted/60 text-[10px] font-semibold leading-none text-muted outline-none transition-colors hover:border-gold hover:text-text focus-visible:border-gold focus-visible:text-text">i</button>
      <span id={tooltipId} role="tooltip" className="invisible pointer-events-none absolute left-1/2 top-full z-30 mt-2 w-max max-w-52 -translate-x-1/2 rounded-card border border-line bg-surface-raised px-2.5 py-1.5 text-xs font-normal leading-4 text-text opacity-0 shadow-card transition-opacity duration-150 group-hover/sections-info:visible group-hover/sections-info:opacity-100 group-focus-within/sections-info:visible group-focus-within/sections-info:opacity-100">Sections are used to create groups of exercises.</span>
    </span>
  );
}

function DayEditor({ day, weekId, index, count, rows, onRemove, useSections, canDrag, draggedExercise, onExerciseDragStart, onExerciseDrop, onExerciseDragEnd }: { day: WorkoutDay; weekId: string; index: number; count: number; rows: Map<string, GridRow>; onRemove: (r: Removal) => void; useSections: boolean } & ExerciseDragProps) {
  const commit = useCommandCommit();
  return (
    <div className="min-w-0" onDragOver={(event) => { if (draggedExercise) event.preventDefault(); }} onDrop={(event) => onExerciseDrop(event, { kind: 'day', dayId: day.id })}>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <CommitField
          label="Focus (optional)"
          placeholder="Legs, Pull, Push…"
          value={dayFocus(day)}
          rejectKey={`${day.id}:label`}
          className="min-w-0 flex-1 basis-40"
          onCommit={(t) => t.trim().length > 120 ? 'Keep focus under 120 characters' : commit({ type: 'updateDay', id: day.id, patch: { label: t.trim() } })}
        />
        <CommitField label="Date (optional)" type="date" value={day.scheduledDate ?? ''} rejectKey={`${day.id}:scheduledDate`} className="w-full sm:w-44" onCommit={(t) => commit({ type: 'updateDay', id: day.id, patch: { scheduledDate: t || null } })} />
        <div className="flex min-h-11 items-center gap-2 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" className="size-4 accent-[var(--color-gold)]" checked={useSections} onChange={(event) => commit({ type: 'updateWeek', id: weekId, patch: { useSections: event.target.checked } })} />Use sections</label>
          <SectionsInfo />
        </div>
        <NodeActions id={day.id} index={index} count={count} parentId={weekId} what={dayHeading(day, index)} onRemove={onRemove} />
      </div>
      {!useSections ? <ol className="exercise-section-rail relative mt-4 divide-y divide-line pl-8">
        {day.sections.flatMap((section) => section.exercises.map((exercise, exerciseIndex) => <ExerciseEditor key={exercise.id} exercise={exercise} row={rows.get(exercise.id)!} previous={section.exercises[exerciseIndex - 1] ?? null} groupLabel={undefined} sectionId={section.id} index={exerciseIndex} count={section.exercises.length} onRemove={onRemove} canDrag={canDrag} draggedExercise={draggedExercise} onExerciseDragStart={onExerciseDragStart} onExerciseDrop={onExerciseDrop} onExerciseDragEnd={onExerciseDragEnd} />))}
      </ol> : <div className="grid gap-3">
        {day.sections.map((section, i) => (
          <SectionEditor key={section.id} section={section} parentId={day.id} index={i} count={day.sections.length} rows={rows} onRemove={onRemove} canDrag={canDrag} draggedExercise={draggedExercise} onExerciseDragStart={onExerciseDragStart} onExerciseDrop={onExerciseDrop} onExerciseDragEnd={onExerciseDragEnd} />
        ))}
      </div>}
      {useSections ? <div className="mt-3"><AddSection parentId={day.id} /></div> : <AddExercise sectionId={day.sections.at(-1)?.id} dayId={day.id} />}
    </div>
  );
}

function AddSection({ parentId }: { parentId: string | null }) {
  const commit = useCommandCommit();
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Button variant="secondary" onClick={() => commit({ type: 'insert', parentId, node: newSection(parentId === null ? 'preparation' : 'main', 'New section') })}>
        Add section
      </Button>
    </div>
  );
}

function SectionEditor({
  section,
  parentId,
  index,
  count,
  rows,
  onRemove,
  canDrag,
  draggedExercise,
  onExerciseDragStart,
  onExerciseDrop,
  onExerciseDragEnd,
}: {
  section: Section;
  parentId: string | null;
  index: number;
  count: number;
  rows: Map<string, GridRow>;
  onRemove: (r: Removal) => void;
} & ExerciseDragProps) {
  const commit = useCommandCommit();
  const name = section.title.trim() || 'Unnamed section';
  const groups = new Map<string, { name: string; count: number }>();
  const groupLabels = section.exercises.map((exercise) => {
    if (!exercise.groupId) return undefined;
    const group = groups.get(exercise.groupId) ?? { name: groups.size < 26 ? String.fromCharCode(65 + groups.size) : `Group ${groups.size + 1} · `, count: 0 };
    group.count += 1;
    groups.set(exercise.groupId, group);
    return `${group.name}${group.count}`;
  });
  return (
    <details open className="group/section min-w-0 border-t border-line pt-3" onDragOver={(event) => { if (draggedExercise) event.preventDefault(); }} onDrop={(event) => onExerciseDrop(event, { kind: 'section', sectionId: section.id })}>
      <DisclosureSummary onMouseDown={(event) => event.preventDefault()} onClick={(event) => event.currentTarget.focus()} className="flex min-h-11 cursor-pointer list-none items-center gap-2 py-2 [&::-webkit-details-marker]:hidden">
        <span className="shrink-0 rounded-full border border-line bg-surface-raised px-2 py-0.5 text-[11px] font-medium leading-4 text-muted">Section</span><h3 className="min-w-0 break-words text-base font-semibold">{name}</h3>
        <span className="ml-auto shrink-0 text-xs text-muted">{section.exercises.length} exercises</span>
      </DisclosureSummary>
      <div className="mt-3">
      <div className="flex flex-wrap items-end gap-3">
        <CommitField label="Section title" value={section.title} rejectKey={`${section.id}:title`} placeholder="Preparation, main workout, etc." className="min-w-0 flex-1 basis-40" onCommit={(t) => commit({ type: 'updateSection', id: section.id, patch: { title: t } })} />
        <NodeActions id={section.id} index={index} count={count} parentId={parentId} what={`section “${name}”`} onRemove={onRemove} />
      </div>
      <CommitField
        label="Instructions"
        value={section.instructions}
        rejectKey={`${section.id}:instructions`}
        multiline
        className="mt-3"
        placeholder="E.g. 2 rounds, rest 30s between movements"
        onCommit={(t) => commit({ type: 'updateSection', id: section.id, patch: { instructions: t } })}
      />
      <ol className="exercise-section-rail relative mt-4 divide-y divide-line pl-8">
        {section.exercises.map((exercise, i) => (
          <ExerciseEditor
            key={exercise.id}
            exercise={exercise}
            row={rows.get(exercise.id)!}
            previous={section.exercises[i - 1] ?? null}
            groupLabel={groupLabels[i]}
            sectionId={section.id}
            index={i}
            count={section.exercises.length}
            onRemove={onRemove}
            canDrag={canDrag}
            draggedExercise={draggedExercise}
            onExerciseDragStart={onExerciseDragStart}
            onExerciseDrop={onExerciseDrop}
            onExerciseDragEnd={onExerciseDragEnd}
          />
        ))}
      </ol>
      <AddExercise sectionId={section.id} />
      </div>
    </details>
  );
}

function AddExercise({ sectionId, dayId }: { sectionId?: string; dayId?: string }) {
  const commit = useCommandCommit();
  const editor = useEditor();
  const [name, setName] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim() === '') return;
    if (sectionId) {
      if (!commit({ type: 'insert', parentId: sectionId, node: newExercise(name.trim()) })) setName('');
      return;
    }
    if (!dayId) return;
    const section = newSection('main', '');
    const result = editor.dispatch([
      { type: 'insert', parentId: dayId, node: section },
      { type: 'insert', parentId: section.value.id, node: newExercise(name.trim()) },
    ]);
    if (!result) setName('');
  };
  return (
    <form onSubmit={submit} className="mt-3 flex flex-wrap gap-2">
      <label className="sr-only" htmlFor={`add-${sectionId ?? dayId}`}>
        New exercise name
      </label>
      <input
        id={`add-${sectionId ?? dayId}`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Add an exercise"
        maxLength={200}
        className="min-h-11 min-w-0 flex-1 rounded-card border border-line bg-ink px-3 text-base text-text placeholder:text-muted/60 focus:border-gold focus:outline-none sm:text-sm"
      />
      <Button type="submit" variant="secondary" disabled={name.trim() === ''}>
        Add exercise
      </Button>
    </form>
  );
}

const TARGET_FIELDS: { column: GridColumnKey; label: string; placeholder?: string }[] = [
  { column: 'sets', label: 'Sets', placeholder: '3' },
  { column: 'effort', label: 'Reps / time', placeholder: '8-10 or 45s' },
  { column: 'load', label: 'Load' },
  { column: 'rir', label: 'RIR', placeholder: '1-2' },
  { column: 'rpe', label: 'RPE' },
];

function ExerciseEditor({
  exercise,
  row,
  previous,
  groupLabel,
  sectionId,
  index,
  count,
  onRemove,
  canDrag,
  draggedExercise,
  onExerciseDragStart,
  onExerciseDrop,
  onExerciseDragEnd,
}: {
  exercise: Exercise;
  row: GridRow;
  previous: Exercise | null;
  groupLabel?: string;
  sectionId: string;
  index: number;
  count: number;
  onRemove: (r: Removal) => void;
} & ExerciseDragProps) {
  const rawCommitCell = useCellCommit();
  const commit = useCommandCommit();
  const editor = useEditor();
  const commitCell = (id: string, column: GridColumnKey, text: string) => {
    const message = rawCommitCell(id, column, text);
    editor.setRejected(cellKey(id, column), message ? { text, message } : null);
    return message;
  };
  const rejected = (column: GridColumnKey) => editor.state.rejected[cellKey(exercise.id, column)];
  const cell = (column: GridColumnKey) => cellText(row, column);
  const mode = cell('loadMode');
  const unit = cell('unit');
  const perSide = cell('perSide');
  const grouped = exercise.groupId !== null && previous?.groupId === exercise.groupId;
  const perSet = exercise.prescription.targets.length > 1;
  const hasIssue = Object.keys(editor.state.rejected).some((k) => k.startsWith(`${exercise.id}:`));

  const toggleGroup = (on: boolean) => {
    if (!previous) return null;
    if (!on) return commit({ type: 'updateExercise', id: exercise.id, patch: { groupId: null } });
    const groupId = previous.groupId ?? crypto.randomUUID();
    const commands: DraftCommand[] = [{ type: 'updateExercise', id: exercise.id, patch: { groupId } }];
    if (!previous.groupId) commands.unshift({ type: 'updateExercise', id: previous.id, patch: { groupId } });
    const error = editor.dispatch(commands);
    return error?.message ?? null;
  };

  return (
    <li className={`exercise-editor relative isolate min-w-0 py-3 ${draggedExercise === exercise.id ? 'opacity-40' : ''}`} onDragOver={(event) => { if (draggedExercise && draggedExercise !== exercise.id) event.preventDefault(); }} onDrop={(event) => {
      const rect = event.currentTarget.getBoundingClientRect();
      onExerciseDrop(event, { kind: 'exercise', exerciseId: exercise.id, edge: event.clientY < rect.top + rect.height / 2 ? 'before' : 'after' });
    }}>
      {exercise.groupId ? <p className="mb-2 text-xs font-medium text-gold-fg">Superset {groupLabel}</p> : null}
      <details open className="group/exercise">
        <DisclosureSummary draggable={canDrag} onDragStart={(event) => onExerciseDragStart(event, exercise.id)} onDragEnd={onExerciseDragEnd} onMouseDown={(event) => event.preventDefault()} onClick={(event) => event.currentTarget.focus()} className="relative flex min-h-11 cursor-grab list-none items-center gap-2 py-2 [&::-webkit-details-marker]:hidden">
          <span aria-hidden className="pointer-events-none absolute -left-8 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full bg-gold text-on-gold-icon [&>svg]:size-3">
            <TrainingIcon />
          </span>
          <span className="shrink-0 rounded-full border border-gold/25 bg-gold/10 px-2 py-0.5 text-[11px] font-medium leading-4 text-gold-fg">Exercise</span>
          <span className="min-w-0 break-words text-sm font-medium">{exercise.name || 'Unnamed exercise'}</span>
          {hasIssue ? <span className="ml-auto text-xs text-danger">Invalid edit</span> : <span className="ml-auto min-w-0 text-right text-xs text-muted group-open/exercise:hidden">{[cell('sets') ? `${cell('sets')} sets` : '', cell('effort') ? `${cell('effort')}${cell('effort').endsWith('s') ? '' : ' reps'}` : '', cell('load') ? `${cell('load')} ${unit}` : ''].filter(Boolean).join(' · ')}</span>}
        </DisclosureSummary>
      <div className="exercise-targets">
        <span className="self-end pb-3 text-sm tabular-nums text-muted">{row.position}</span>
        <CommitField label="Exercise" placeholder="Exercise name" value={exercise.name} rejectKey={cellKey(exercise.id, 'name')} className="flex-1" inputClassName="font-medium" onCommit={(t) => commitCell(exercise.id, 'name', t)} />

        {TARGET_FIELDS.slice(0, 2).map((f) => (
          <CommitField key={f.column} label={f.label} value={cell(f.column)} rejectKey={cellKey(exercise.id, f.column)} placeholder={f.placeholder} onCommit={(t) => commitCell(exercise.id, f.column, t)} />
        ))}
        <CommitField label={`${mode === 'Band' ? 'Band' : mode === 'Bodyweight' ? 'Added' : 'Load'}${unit && !unit.includes('/') ? ` (${unit})` : ''}`} value={cell('load')} rejectKey={cellKey(exercise.id, 'load')} onCommit={(t) => commitCell(exercise.id, 'load', t)} />
        {TARGET_FIELDS.slice(3).map((f) => (
          <CommitField key={f.column} label={f.label} value={cell(f.column)} rejectKey={cellKey(exercise.id, f.column)} placeholder={f.placeholder} onCommit={(t) => commitCell(exercise.id, f.column, t)} />
        ))}
        <div className="self-end"><NodeActions id={exercise.id} index={index} count={count} parentId={sectionId} what={`“${exercise.name}”`} onRemove={onRemove} /></div>
      </div>
      <details className="mt-2" open={hasIssue || undefined}>
        <DisclosureSummary className="min-h-11 cursor-pointer py-3 text-sm text-muted hover:text-text">Exercise details{mode || unit || perSide || exercise.muscles.length ? ` · ${[exercise.muscles.join(', '), mode, unit, perSide === 'Yes' ? 'per side' : perSide].filter(Boolean).join(' · ')}` : ''}</DisclosureSummary>
        <p className="mb-3 text-xs text-muted">{perSet ? 'Values differ per set, listed as set 1 / set 2 / …' : 'Use “/” to give each set its own value, e.g. 10 / 8 / 6.'}</p>
        <div className="grid gap-3 sm:grid-cols-3">
        {perSide.includes('/') || rejected('perSide') ? (
          <CommitField label="Per side" value={perSide} rejectKey={cellKey(exercise.id, 'perSide')} onCommit={(t) => commitCell(exercise.id, 'perSide', t)} />
        ) : (
          <label className="flex min-h-11 items-center gap-2 self-end text-sm">
            <input type="checkbox" className="size-4 accent-[var(--color-gold)]" checked={perSide === 'Yes'} onChange={(e) => editor.setRejected(cellKey(exercise.id, 'perSide'), errorOf(commitCell(exercise.id, 'perSide', e.target.checked ? 'yes' : ''), e.target.checked ? 'Yes' : ''))} />
            Per side (optional)
          </label>
        )}
        {mode.includes('/') || rejected('loadMode') ? (
          <CommitField label="Load mode" value={mode} rejectKey={cellKey(exercise.id, 'loadMode')} onCommit={(t) => commitCell(exercise.id, 'loadMode', t)} />
        ) : (
          <CommitSelect label="Load mode" value={mode} options={[{ value: '', label: '—' }, ...LOAD_MODE_OPTIONS.map((o) => ({ value: o.label, label: o.label }))]} onCommit={(v) => commitCell(exercise.id, 'loadMode', v)} />
        )}
        {unit.includes('/') || rejected('unit') ? (
          <CommitField label="Unit" value={unit} rejectKey={cellKey(exercise.id, 'unit')} onCommit={(t) => commitCell(exercise.id, 'unit', t)} />
        ) : (
          <CommitSelect label="Unit" value={unit} options={[{ value: '', label: '—' }, { value: 'lb', label: 'lb' }, { value: 'kg', label: 'kg' }]} onCommit={(v) => commitCell(exercise.id, 'unit', v)} />
        )}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {editor.draft.service === 'mesocycle' ? <CommitField label="Muscles" value={cell('muscles')} rejectKey={cellKey(exercise.id, 'muscles')} placeholder="E.g. biceps, triceps"
            hint="Each logged set counts toward every muscle listed. Separate with commas." suggest={weekMuscles(editor.draft, row.weekId)}
            onCommit={(t) => commitCell(exercise.id, 'muscles', t)} /> : null}
          <CommitField label="Notes" value={exercise.notes} rejectKey={cellKey(exercise.id, 'notes')} multiline onCommit={(t) => commitCell(exercise.id, 'notes', t)} />
          <AnnotationFields exercise={exercise} />
          <CommitField
            label="Alternatives"
            value={exercise.alternatives.map((a) => a.name).join(', ')}
            rejectKey={`${exercise.id}:alternatives`}
            hint="Either one counts. Separate with commas."
            onCommit={(t) => {
              const names = t.split(',').map((n) => n.trim()).filter(Boolean);
              // Keep ids for names that stay, so history on an alternative isn't reset by a re-type.
              const alternatives = names.map((name) => exercise.alternatives.find((a) => a.name === name) ?? { id: crypto.randomUUID(), name });
              return commit({ type: 'updateExercise', id: exercise.id, patch: { alternatives } });
            }}
          />
          <CommitField label="Demo link" type="url" inputMode="url" value={exercise.demoUrl ?? ''} rejectKey={`${exercise.id}:demoUrl`} placeholder="https://" onCommit={(t) => commitUrl(t, (demoUrl) => commit({ type: 'updateExercise', id: exercise.id, patch: { demoUrl } }))} />
          {previous ? (
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-[var(--color-gold)]" checked={grouped} onChange={(e) => toggleGroup(e.target.checked)} />
              Superset with “{previous.name}”
            </label>
          ) : null}
        </div>
      </details>
      </details>
    </li>
  );
}

const errorOf = (message: string | null, text: string) => (message ? { text, message } : null);

/** Free-text annotations such as "drop set", per set when targets differ per set. */
function AnnotationFields({ exercise }: { exercise: Exercise }) {
  const commit = useCommandCommit();
  const { targets } = exercise.prescription;
  if (targets.length === 0) return <p className="self-end text-xs text-muted">Annotations (such as “drop set”) become available once the exercise has a target.</p>;
  return (
    <div className="grid gap-2">
      {targets.map((t, i) => (
        <CommitField
          key={i}
          label={targets.length === 1 ? 'Annotations' : `Set ${i + 1} annotations`}
          value={t.annotations.join(', ')}
          rejectKey={`${exercise.id}:annotations:${i}`}
          placeholder="drop set, pause at bottom"
          onCommit={(text) =>
            commit({ type: 'updateTarget', exerciseId: exercise.id, index: i, patch: { annotations: text.split(',').map((a) => a.trim()).filter(Boolean) } })
          }
        />
      ))}
    </div>
  );
}

/** Program-level fields, shared by List View's details panel and the Spreadsheet's details dialog. */
export function ProgramDetailsFields() {
  const { draft } = useEditor();
  const commit = useCommandCommit();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <CommitField
        label={draft.service === 'mesocycle' ? 'Program Style' : 'Title'}
        value={draft.title}
        rejectKey="program:title"
        placeholder={draft.service === 'mesocycle' ? 'e.g. Hypertrophy' : 'Shown to the client'}
        onCommit={(t) => (t.length > 160 ? `Keep the ${draft.service === 'mesocycle' ? 'style' : 'title'} under 160 characters` : commit({ type: 'updateProgram', patch: { title: t } }))}
      />
      {draft.service === 'mesocycle' ? <CommitField
        label="Program Theme"
        value={draft.programTheme ?? ''}
        rejectKey="program:programTheme"
        placeholder="Shown beneath the program style"
        onCommit={(text) => text.length > 240 ? 'Keep the theme under 240 characters' : commit({ type: 'updateProgram', patch: { programTheme: text } })}
      /> : null}
      <CommitField
        className={draft.service === 'mesocycle' ? 'sm:col-span-2' : undefined}
        label="Program notes"
        value={draft.coachNotes}
        rejectKey="program:coachNotes"
        multiline
        placeholder="Instructions that apply to the whole program"
        onCommit={(t) => commit({ type: 'updateProgram', patch: { coachNotes: t } })}
      />
    </div>
  );
}
