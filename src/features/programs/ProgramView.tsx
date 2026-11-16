import { useState, type FormEvent, type ReactNode } from 'react';
import { z } from 'zod';
import { Dialog } from '@/components/Dialog';
import { Button } from '@/components/ui';
import { newDay, newExercise, newResource, newSection, newWeek, type DraftCommand } from '@/domain/programs/commands';
import type { Exercise, ProgramWeek, Section, WorkoutDay } from '@/domain/programs/contract';
import { cellText, gridRows, LOAD_MODE_OPTIONS, type GridColumnKey, type GridRow } from '@/domain/programs/grid';
import {
  cellKey,
  CommitField,
  CommitSelect,
  CopyGlyph,
  DownGlyph,
  IconButton,
  RemoveGlyph,
  UpGlyph,
  useCellCommit,
  useCommandCommit,
} from './fields';
import { useEditor } from './useDraftEditor';

/**
 * Matt's Program view (FR-05): the draft as nested weeks → days → sections → exercises. It edits
 * through the same commands and cell parsing as the Grid, so both views always show the same draft.
 */

const SECTION_KINDS: { value: Section['kind']; label: string }[] = [
  { value: 'preparation', label: 'Preparation' },
  { value: 'main', label: 'Main' },
  { value: 'cooldown', label: 'Cooldown' },
  { value: 'other', label: 'Other' },
];

type Removal = { id: string; what: string };

export function ProgramView() {
  const editor = useEditor();
  const commit = useCommandCommit();
  const { draft } = editor;
  const [removal, setRemoval] = useState<Removal | null>(null);
  // Row positions for exercises, so the Program view numbers them like the Grid.
  const rows = new Map(gridRows(draft).map((r) => [r.exerciseId, r]));

  const required = (what: string) => (text: string) => (text.trim() === '' ? `${what} can't be blank` : null);

  return (
    <div className="grid gap-5">
      <Panel title="Program">
        <div className="grid gap-3 sm:grid-cols-2">
          <CommitField
            label="Title"
            value={draft.title}
            rejectKey="program:title"
            placeholder="Shown to the client"
            onCommit={(t) => (t.length > 160 ? 'Keep the title under 160 characters' : commit({ type: 'updateProgram', patch: { title: t } }))}
          />
          <CommitField
            label="Program notes"
            value={draft.coachNotes}
            rejectKey="program:coachNotes"
            multiline
            placeholder="Instructions that apply to the whole program"
            onCommit={(t) => commit({ type: 'updateProgram', patch: { coachNotes: t } })}
          />
        </div>
      </Panel>

      <Panel
        title="Every-day sections"
        description="Warm-ups or mobility the client does before every workout."
        footer={<AddSection parentId={null} />}
      >
        {draft.sharedSections.length === 0 ? <p className="text-sm text-muted">None yet.</p> : null}
        <div className="grid gap-3">
          {draft.sharedSections.map((section, i) => (
            <SectionEditor key={section.id} section={section} parentId={null} index={i} count={draft.sharedSections.length} rows={rows} onRemove={setRemoval} />
          ))}
        </div>
      </Panel>

      <div className="grid gap-3">
        {draft.weeks.map((week, i) => (
          <WeekEditor key={week.id} week={week} index={i} count={draft.weeks.length} rows={rows} onRemove={setRemoval} />
        ))}
        <div>
          <Button variant="secondary" onClick={() => commit({ type: 'insert', parentId: null, node: newWeek(`Week ${draft.weeks.length + 1}`) })}>
            Add week
          </Button>
        </div>
      </div>

      <Panel
        title="Resources"
        description="Guides and links the client can open from the program."
        footer={
          <Button variant="secondary" onClick={() => commit({ type: 'insert', parentId: null, node: newResource('New resource') })}>
            Add resource
          </Button>
        }
      >
        {draft.resources.length === 0 ? <p className="text-sm text-muted">None yet.</p> : null}
        <ul className="grid gap-3">
          {draft.resources.map((r, i) => (
            <li key={r.id} className="grid gap-3 rounded-card border border-line p-3 sm:grid-cols-[1fr_1fr_auto]">
              <CommitField label="Title" value={r.title} rejectKey={`${r.id}:title`} onCommit={(t) => required('Title')(t) ?? commit({ type: 'updateResource', id: r.id, patch: { title: t.trim() } })} />
              <CommitField label="Link" type="url" inputMode="url" value={r.url ?? ''} rejectKey={`${r.id}:url`} placeholder="https://" onCommit={(t) => commitUrl(t, (url) => commit({ type: 'updateResource', id: r.id, patch: { url } }))} />
              <NodeActions id={r.id} index={i} count={draft.resources.length} parentId={null} what={`resource “${r.title}”`} onRemove={setRemoval} />
              <CommitField label="Text" value={r.body} rejectKey={`${r.id}:body`} multiline className="sm:col-span-3" onCommit={(t) => commit({ type: 'updateResource', id: r.id, patch: { body: t } })} />
            </li>
          ))}
        </ul>
      </Panel>

      {removal ? (
        <Dialog
          title={`Remove ${removal.what}?`}
          description="It is removed from this draft only. Published revisions and client history are unchanged."
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
    <section className="rounded-card border border-line bg-surface p-4 sm:p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      {description ? <p className="mb-3 text-xs text-muted">{description}</p> : <div className="mb-3" />}
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
    <div className="flex shrink-0 items-start justify-end">
      <IconButton label={`Move ${what} up`} disabled={index === 0} onClick={() => commit({ type: 'move', id, parentId, index: index - 1 })}>
        <UpGlyph />
      </IconButton>
      <IconButton label={`Move ${what} down`} disabled={index === count - 1} onClick={() => commit({ type: 'move', id, parentId, index: index + 1 })}>
        <DownGlyph />
      </IconButton>
      {duplicable ? (
        <IconButton label={`Duplicate ${what}`} onClick={() => commit({ type: 'duplicate', id })}>
          <CopyGlyph />
        </IconButton>
      ) : null}
      <IconButton label={`Remove ${what}`} tone="danger" onClick={() => onRemove({ id, what })}>
        <RemoveGlyph />
      </IconButton>
    </div>
  );
}

function WeekEditor({ week, index, count, rows, onRemove }: { week: ProgramWeek; index: number; count: number; rows: Map<string, GridRow>; onRemove: (r: Removal) => void }) {
  const commit = useCommandCommit();
  const name = week.label.trim() || `Week ${week.index}`;
  return (
    <details open={index === 0} className="group rounded-card border border-line bg-surface">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 sm:px-5 [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="text-muted transition-transform group-open:rotate-90">›</span>
        <span className="font-semibold">{name}</span>
        <span className="text-xs text-muted">
          {week.days.length} {week.days.length === 1 ? 'day' : 'days'}
        </span>
      </summary>
      <div className="grid gap-4 border-t border-line p-4 sm:p-5">
        <div className="flex flex-wrap items-end gap-3">
          <CommitField label="Week label" value={week.label} rejectKey={`${week.id}:label`} placeholder={`Week ${week.index}`} className="min-w-40 flex-1" onCommit={(t) => commit({ type: 'updateWeek', id: week.id, patch: { label: t } })} />
          <CommitField label="Starts" type="date" value={week.startDate ?? ''} rejectKey={`${week.id}:startDate`} className="w-44" onCommit={(t) => commit({ type: 'updateWeek', id: week.id, patch: { startDate: t || null } })} />
          <NodeActions id={week.id} index={index} count={count} parentId={null} what={name} onRemove={onRemove} />
        </div>
        {week.days.map((day, i) => (
          <DayEditor key={day.id} day={day} weekId={week.id} index={i} count={week.days.length} rows={rows} onRemove={onRemove} />
        ))}
        <div>
          <Button variant="secondary" onClick={() => commit({ type: 'insert', parentId: week.id, node: newDay(`Day ${week.days.length + 1}`) })}>
            Add day
          </Button>
        </div>
      </div>
    </details>
  );
}

function DayEditor({ day, weekId, index, count, rows, onRemove }: { day: WorkoutDay; weekId: string; index: number; count: number; rows: Map<string, GridRow>; onRemove: (r: Removal) => void }) {
  const commit = useCommandCommit();
  return (
    <div className="rounded-card border border-line bg-ink/40 p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <CommitField
          label="Day"
          value={day.label}
          rejectKey={`${day.id}:label`}
          className="min-w-40 flex-1"
          onCommit={(t) => (t.trim() === '' ? 'Day needs a name' : commit({ type: 'updateDay', id: day.id, patch: { label: t.trim() } }))}
        />
        <CommitField label="Date (optional)" type="date" value={day.scheduledDate ?? ''} rejectKey={`${day.id}:scheduledDate`} className="w-44" onCommit={(t) => commit({ type: 'updateDay', id: day.id, patch: { scheduledDate: t || null } })} />
        <NodeActions id={day.id} index={index} count={count} parentId={weekId} what={`day “${day.label}”`} onRemove={onRemove} />
      </div>
      <div className="grid gap-3">
        {day.sections.map((section, i) => (
          <SectionEditor key={section.id} section={section} parentId={day.id} index={i} count={day.sections.length} rows={rows} onRemove={onRemove} />
        ))}
      </div>
      <div className="mt-3">
        <AddSection parentId={day.id} />
      </div>
    </div>
  );
}

function AddSection({ parentId }: { parentId: string | null }) {
  const commit = useCommandCommit();
  const [kind, setKind] = useState<Section['kind']>(parentId === null ? 'preparation' : 'main');
  return (
    <div className="flex flex-wrap items-end gap-2">
      <CommitSelect label="New section type" hideLabel value={kind} options={SECTION_KINDS} onCommit={(v) => (setKind(v as Section['kind']), null)} className="w-40" />
      <Button variant="secondary" onClick={() => commit({ type: 'insert', parentId, node: newSection(kind, '') })}>
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
}: {
  section: Section;
  parentId: string | null;
  index: number;
  count: number;
  rows: Map<string, GridRow>;
  onRemove: (r: Removal) => void;
}) {
  const commit = useCommandCommit();
  const kindLabel = SECTION_KINDS.find((k) => k.value === section.kind)!.label;
  const name = section.title.trim() || kindLabel;
  return (
    <div className="rounded-card border border-line bg-surface p-3">
      <div className="flex flex-wrap items-end gap-3">
        <CommitSelect
          label="Section type"
          value={section.kind}
          options={SECTION_KINDS}
          className="w-40"
          onCommit={(v) => commit({ type: 'updateSection', id: section.id, patch: { kind: v as Section['kind'] } })}
        />
        <CommitField label="Section title" value={section.title} rejectKey={`${section.id}:title`} placeholder={kindLabel} className="min-w-40 flex-1" onCommit={(t) => commit({ type: 'updateSection', id: section.id, patch: { title: t } })} />
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
      <ol className="mt-3 grid gap-2">
        {section.exercises.map((exercise, i) => (
          <ExerciseEditor
            key={exercise.id}
            exercise={exercise}
            row={rows.get(exercise.id)!}
            previous={section.exercises[i - 1] ?? null}
            sectionId={section.id}
            index={i}
            count={section.exercises.length}
            onRemove={onRemove}
          />
        ))}
      </ol>
      <AddExercise sectionId={section.id} />
    </div>
  );
}

function AddExercise({ sectionId }: { sectionId: string }) {
  const commit = useCommandCommit();
  const [name, setName] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim() === '') return;
    if (!commit({ type: 'insert', parentId: sectionId, node: newExercise(name.trim()) })) setName('');
  };
  return (
    <form onSubmit={submit} className="mt-3 flex flex-wrap gap-2">
      <label className="sr-only" htmlFor={`add-${sectionId}`}>
        New exercise name
      </label>
      <input
        id={`add-${sectionId}`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Add an exercise"
        maxLength={200}
        className="min-h-11 min-w-0 flex-1 rounded-card border border-line bg-ink px-3 text-base text-text placeholder:text-muted/60 focus:border-gold focus:outline-none sm:text-sm"
      />
      <Button type="submit" variant="secondary" disabled={name.trim() === ''}>
        Add
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
  sectionId,
  index,
  count,
  onRemove,
}: {
  exercise: Exercise;
  row: GridRow;
  previous: Exercise | null;
  sectionId: string;
  index: number;
  count: number;
  onRemove: (r: Removal) => void;
}) {
  const commitCell = useCellCommit();
  const commit = useCommandCommit();
  const editor = useEditor();
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
    <li className={`rounded-card border bg-ink/40 p-3 ${grouped ? 'ml-4 border-l-2 border-l-gold border-y-line border-r-line' : 'border-line'}`}>
      <div className="flex items-start gap-2">
        <span className="mt-3 w-6 shrink-0 text-right text-sm tabular-nums text-muted">{row.position}</span>
        <CommitField label="Exercise" hideLabel value={exercise.name} rejectKey={cellKey(exercise.id, 'name')} className="flex-1" inputClassName="font-medium" onCommit={(t) => commitCell(exercise.id, 'name', t)} />
        <NodeActions id={exercise.id} index={index} count={count} parentId={sectionId} what={`“${exercise.name}”`} onRemove={onRemove} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4 lg:grid-cols-8">
        {TARGET_FIELDS.slice(0, 2).map((f) => (
          <CommitField key={f.column} label={f.label} value={cell(f.column)} rejectKey={cellKey(exercise.id, f.column)} placeholder={f.placeholder} onCommit={(t) => commitCell(exercise.id, f.column, t)} />
        ))}
        {perSide.includes('/') ? (
          <CommitField label="Per side" value={perSide} rejectKey={cellKey(exercise.id, 'perSide')} onCommit={(t) => commitCell(exercise.id, 'perSide', t)} />
        ) : (
          <label className="flex min-h-11 items-center gap-2 self-end text-sm">
            <input type="checkbox" className="size-4 accent-[var(--color-gold)]" checked={perSide === 'Yes'} onChange={(e) => editor.setRejected(cellKey(exercise.id, 'perSide'), errorOf(commitCell(exercise.id, 'perSide', e.target.checked ? 'yes' : ''), e.target.checked ? 'Yes' : ''))} />
            Per side
          </label>
        )}
        {mode.includes('/') ? (
          <CommitField label="Load mode" value={mode} rejectKey={cellKey(exercise.id, 'loadMode')} onCommit={(t) => commitCell(exercise.id, 'loadMode', t)} />
        ) : (
          <CommitSelect label="Load mode" value={mode} options={[{ value: '', label: '—' }, ...LOAD_MODE_OPTIONS.map((o) => ({ value: o.label, label: o.label }))]} onCommit={(v) => commitCell(exercise.id, 'loadMode', v)} />
        )}
        <CommitField label={mode === 'Band' ? 'Band' : mode === 'Bodyweight' ? 'Added' : 'Load'} value={cell('load')} rejectKey={cellKey(exercise.id, 'load')} onCommit={(t) => commitCell(exercise.id, 'load', t)} />
        {unit.includes('/') ? (
          <CommitField label="Unit" value={unit} rejectKey={cellKey(exercise.id, 'unit')} onCommit={(t) => commitCell(exercise.id, 'unit', t)} />
        ) : (
          <CommitSelect label="Unit" value={unit} options={[{ value: '', label: '—' }, { value: 'lb', label: 'lb' }, { value: 'kg', label: 'kg' }]} onCommit={(v) => commitCell(exercise.id, 'unit', v)} />
        )}
        {TARGET_FIELDS.slice(3).map((f) => (
          <CommitField key={f.column} label={f.label} value={cell(f.column)} rejectKey={cellKey(exercise.id, f.column)} placeholder={f.placeholder} onCommit={(t) => commitCell(exercise.id, f.column, t)} />
        ))}
      </div>
      <p className="mt-1.5 text-xs text-muted">{perSet ? 'Values differ per set, listed as set 1 / set 2 / …' : 'Use “/” to give each set its own value, e.g. 10 / 8 / 6.'}</p>
      <details className="mt-2" open={hasIssue || undefined}>
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm text-muted hover:text-text sm:min-h-9">Notes, alternatives and more</summary>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
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
