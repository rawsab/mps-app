import { useId, useState, type FormEvent } from 'react';
import { Dialog } from '@/components/Dialog';
import { Alert, Button, SelectField } from '@/components/ui';
import { gridRows, planMoveGridExercise } from '@/domain/programs/grid';
import { dayHeading, weekName } from '@/domain/programs/labels';
import { capitalize } from '@/lib/format';
import { useEditor } from './useDraftEditor';

export type GridMoveTarget = { kind: 'day' | 'exercise'; id: string };

/** A move uses stable ids and the normal reversible command batch, including entire supersets. */
export function MoveGridItemDialog({ target, onClose }: { target: GridMoveTarget; onClose: () => void }) {
  const editor = useEditor();
  const id = useId();
  const row = target.kind === 'exercise' ? gridRows(editor.draft).find((row) => row.exerciseId === target.id) : undefined;
  const sourceWeek = editor.draft.weeks.find((week) => target.kind === 'day' ? week.days.some((day) => day.id === target.id) : week.id === row?.weekId);
  const sourceDay = sourceWeek?.days.find((day) => day.id === target.id);
  const [weekId, setWeekId] = useState(sourceWeek?.id ?? 'shared');
  const [dayId, setDayId] = useState(row?.dayId ?? '');
  const [sectionId, setSectionId] = useState(row?.sectionId ?? '');
  const [error, setError] = useState<string | null>(null);
  const week = editor.draft.weeks.find((week) => week.id === weekId);
  const day = week?.days.find((day) => day.id === dayId);
  const sections = weekId === 'shared' ? editor.draft.sharedSections : day?.sections ?? [];
  const name = row?.exercise.name ?? (sourceDay && sourceWeek ? dayHeading(sourceDay, sourceWeek.days.indexOf(sourceDay)) : 'Item');
  const grouped = row?.exercise.groupId !== null && row?.exercise.groupId !== undefined;
  const validDestination = target.kind === 'day' ? !!week && week.id !== sourceWeek?.id
    : sections.some((section) => section.id === sectionId) && sectionId !== row?.sectionId;
  const exists = target.kind === 'day' ? !!sourceDay : !!row;
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!validDestination || !exists) return;
    const commands = target.kind === 'day'
      ? [{ type: 'move' as const, id: target.id, parentId: weekId }]
      : planMoveGridExercise(editor.draft, target.id, sectionId);
    const problem = editor.dispatch(commands);
    if (problem) { setError(problem.message); return; }
    onClose();
    // The source control can disappear after a move. Restore focus at the destination instead.
    requestAnimationFrame(() => {
      const destination = target.kind === 'day'
        ? document.querySelector<HTMLInputElement>(`[data-edit-key="${CSS.escape(`${target.id}:label`)}"]`)
        : document.querySelector<HTMLTableCellElement>(`[data-grid-exercise="${CSS.escape(target.id)}"] [data-grid-column="name"]`);
      if (destination instanceof HTMLTableCellElement) destination.click();
      else destination?.focus({ preventScroll: true });
      destination?.scrollIntoView({ block: 'center', inline: 'nearest' });
    });
  }
  return <Dialog title={`Move ${target.kind === 'day' ? 'workout day' : grouped ? 'superset' : 'exercise'}`} description={grouped ? 'All exercises in this superset move together. Targets, notes and history identities are kept.' : 'Targets, notes and history identities are kept.'}
    onClose={onClose} footer={<>
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      <Button type="submit" form={id} disabled={!exists || !validDestination}>Move {target.kind === 'day' ? 'day' : grouped ? 'superset' : 'exercise'}</Button>
    </>}>
    <form id={id} onSubmit={submit} className="grid gap-4 p-4 sm:p-5">
      <p className="break-words font-medium">{name}</p>
      <SelectField label="Destination week" value={weekId} onChange={(event) => {
        const nextWeek = editor.draft.weeks.find((week) => week.id === event.target.value);
        const nextDay = nextWeek?.days[0];
        setWeekId(event.target.value);
        setDayId(nextDay?.id ?? '');
        setSectionId(event.target.value === 'shared' ? editor.draft.sharedSections[0]?.id ?? '' : nextDay?.sections[0]?.id ?? '');
        setError(null);
      }}>
        {target.kind === 'exercise' ? <option value="shared">Every-workout preparation</option> : null}
        {editor.draft.weeks.map((week, index) => <option key={week.id} value={week.id}>{weekName(index)}</option>)}
      </SelectField>
      {target.kind === 'exercise' ? <>
        {weekId !== 'shared' ? <SelectField label="Destination day" value={dayId} onChange={(event) => {
          const nextDay = week?.days.find((day) => day.id === event.target.value);
          setDayId(event.target.value); setSectionId(nextDay?.sections[0]?.id ?? ''); setError(null);
        }}>
          {!week?.days.length ? <option value="">No days in this week</option> : null}
          {week?.days.map((day, index) => <option key={day.id} value={day.id}>{dayHeading(day, index)}</option>)}
        </SelectField> : null}
        <SelectField label="Destination section" value={sectionId} onChange={(event) => { setSectionId(event.target.value); setError(null); }}>
          {!sections.length ? <option value="">No sections here</option> : null}
          {sections.map((section) => <option key={section.id} value={section.id}>{section.title || capitalize(section.kind)}</option>)}
        </SelectField>
        {!sections.length ? <p className="text-sm text-muted">Add a section at the destination first using Add… in Grid mode.</p> : null}
      </> : null}
      <Alert visible={!exists}>This item no longer exists. Close this dialog and select it again.</Alert>
      <Alert visible={!!error}>{error}</Alert>
    </form>
  </Dialog>;
}
