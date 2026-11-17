import { applyCommands, newDay, newExercise, newSection, type DraftCommand } from './commands';
import type { ProgramDraft } from './contract';
import { gridRows, type GridColumnKey } from './grid';

/** A contextual insertion stays beside its sibling and is one undoable operation. */
export function planInsertGridRow(draft: ProgramDraft, exerciseId: string, column: GridColumnKey, below: boolean,
  newId: () => string = () => crypto.randomUUID()): { commands: DraftCommand[]; exerciseId: string | null } {
  const row = gridRows(draft).find((row) => row.exerciseId === exerciseId);
  if (!row) return { commands: [], exerciseId: null };
  const week = draft.weeks.find((week) => week.id === row.weekId);
  const day = week?.days.find((day) => day.id === row.dayId);
  const sections = day?.sections ?? draft.sharedSections;
  const section = sections.find((section) => section.id === row.sectionId);
  if (!section || (column === 'day' && !day)) return { commands: [], exerciseId: null };
  const exercise = newExercise('', newId);
  if (exercise.kind !== 'exercise') return { commands: [], exerciseId: null };
  exercise.value.logicalKey = exercise.value.id;
  if (column !== 'day' && column !== 'section') return {
    commands: [{ type: 'insert', parentId: section.id, index: section.exercises.findIndex((item) => item.id === exerciseId) + Number(below), node: exercise }],
    exerciseId: exercise.value.id,
  };
  const nextSection = newSection(column === 'day' ? 'main' : section.kind, '', newId);
  if (nextSection.kind !== 'section') return { commands: [], exerciseId: null };
  nextSection.value.exercises = [exercise.value];
  if (column === 'section') return {
    commands: [{ type: 'insert', parentId: day?.id ?? null, index: sections.indexOf(section) + Number(below), node: nextSection }],
    exerciseId: exercise.value.id,
  };
  const nextDay = newDay('', newId);
  if (nextDay.kind !== 'day' || !week || !day) return { commands: [], exerciseId: null };
  nextDay.value.sections = [nextSection.value];
  return { commands: [{ type: 'insert', parentId: week.id, index: week.days.indexOf(day) + Number(below), node: nextDay }], exerciseId: exercise.value.id };
}

/** Generate fresh subtree ids once, then append the concrete copy for stable undo/redo. */
export function planDuplicateWeek(draft: ProgramDraft, weekId: string, newId: () => string = () => crypto.randomUUID()) {
  const result = applyCommands(draft, [{ type: 'duplicate', id: weekId }], { newId });
  const copy = result.ok ? result.draft.weeks.find((week) => week.id === result.createdIds[0]) : undefined;
  return copy ? { commands: [{ type: 'insert', parentId: null, node: { kind: 'week', value: copy } }] as DraftCommand[], weekId: copy.id }
    : { commands: [] as DraftCommand[], weekId: null };
}
