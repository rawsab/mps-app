import { newSection, type DraftCommand } from './commands';
import type { ProgramDraft } from './contract';
import { gridRows } from './grid';

export type GridRowDrop =
  | { kind: 'exercise'; exerciseId: string; edge: 'before' | 'after' }
  | { kind: 'section'; sectionId: string; edge?: 'before' | 'after' }
  | { kind: 'day'; dayId: string; edge?: 'before' | 'after' };

/** Move stable exercise identities, including complete supersets, in one reversible batch. */
export function planGridRowMove(draft: ProgramDraft, exerciseId: string, target: GridRowDrop,
  newId: () => string = () => crypto.randomUUID()): { commands: DraftCommand[]; error: string | null } {
  const rows = gridRows(draft);
  const source = rows.find((row) => row.exerciseId === exerciseId);
  if (!source) return { commands: [], error: 'This exercise no longer exists.' };
  const sections = [...draft.sharedSections, ...draft.weeks.flatMap((week) => week.days.flatMap((day) => day.sections))];
  const moving = source.exercise.groupId ? rows.filter((row) => row.sectionId === source.sectionId && row.exercise.groupId === source.exercise.groupId) : [source];
  const ids = new Set(moving.map((row) => row.exerciseId));
  const commands: DraftCommand[] = [];
  let sectionId: string;
  let index: number;
  if (target.kind === 'exercise') {
    const anchor = rows.find((row) => row.exerciseId === target.exerciseId);
    if (!anchor) return { commands: [], error: 'The destination no longer exists.' };
    if (ids.has(anchor.exerciseId)) return { commands: [], error: null };
    sectionId = anchor.sectionId;
    const remaining = rows.filter((row) => row.sectionId === sectionId && !ids.has(row.exerciseId));
    // Drop outside the target superset, keeping its members contiguous.
    const group = anchor.exercise.groupId ? remaining.filter((row) => row.exercise.groupId === anchor.exercise.groupId) : [anchor];
    index = target.edge === 'before' ? remaining.findIndex((row) => row.exerciseId === group[0]!.exerciseId)
      : remaining.findIndex((row) => row.exerciseId === group.at(-1)!.exerciseId) + 1;
  } else if (target.kind === 'section') {
    const section = sections.find((section) => section.id === target.sectionId);
    if (!section) return { commands: [], error: 'The destination section no longer exists.' };
    sectionId = section.id;
    index = section.exercises.filter((exercise) => !ids.has(exercise.id)).length;
  } else {
    const day = draft.weeks.flatMap((week) => week.days).find((day) => day.id === target.dayId);
    if (!day) return { commands: [], error: 'The destination day no longer exists.' };
    const section = day.sections.at(-1);
    if (section) {
      sectionId = section.id;
      index = section.exercises.filter((exercise) => !ids.has(exercise.id)).length;
    } else {
      const node = newSection('main', '', newId);
      sectionId = node.value.id;
      commands.push({ type: 'insert', parentId: day.id, node });
      index = 0;
    }
  }
  if (sectionId === source.sectionId) {
    const original = rows.filter((row) => row.sectionId === sectionId).map((row) => row.exerciseId);
    const remaining = original.filter((id) => !ids.has(id));
    const desired = [...remaining.slice(0, index), ...moving.map((row) => row.exerciseId), ...remaining.slice(index)];
    if (desired.every((id, position) => id === original[position])) return { commands: [], error: null };
    // Remove group members from their old positions before positioning the complete block.
    if (moving.length > 1) commands.push(...moving.map((row): DraftCommand => ({ type: 'move', id: row.exerciseId, parentId: sectionId })));
  }
  commands.push(...moving.map((row, offset): DraftCommand => ({ type: 'move', id: row.exerciseId, parentId: sectionId, index: index + offset })));
  return { commands, error: null };
}

export type GridDragSource = { kind: 'exercise' | 'section' | 'day'; id: string };
export type GridDropTarget = GridRowDrop | { kind: 'week'; weekId: string };

/** Days and sections retain their full subtrees and use one stable-id move command. */
export function planGridStructureMove(draft: ProgramDraft, source: GridDragSource, target: GridDropTarget): { commands: DraftCommand[]; error: string | null } {
  if (source.kind === 'exercise') return target.kind === 'week'
    ? { commands: [], error: 'Drop the exercise into an existing day or section.' }
    : planGridRowMove(draft, source.id, target);
  const days = draft.weeks.flatMap((week) => week.days.map((day) => ({ week, day })));
  if (source.kind === 'day') {
    const current = days.find(({ day }) => day.id === source.id);
    if (!current) return { commands: [], error: 'This day no longer exists.' };
    const anchor = target.kind === 'day' ? days.find(({ day }) => day.id === target.dayId) : undefined;
    const week = anchor?.week ?? (target.kind === 'week' ? draft.weeks.find((week) => week.id === target.weekId) : undefined);
    if (!week) return { commands: [], error: 'Drop the day onto another day or week.' };
    if (anchor?.day.id === source.id) return { commands: [], error: null };
    const remaining = week.days.filter((day) => day.id !== source.id);
    const index = anchor ? remaining.findIndex((day) => day.id === anchor.day.id) + Number(target.kind === 'day' && target.edge === 'after') : remaining.length;
    if (week.id === current.week.id && current.week.days.indexOf(current.day) === index) return { commands: [], error: null };
    return { commands: [{ type: 'move', id: source.id, parentId: week.id, index }], error: null };
  }
  const sections = [
    ...draft.sharedSections.map((section) => ({ section, parentId: null as string | null, siblings: draft.sharedSections })),
    ...days.flatMap(({ day }) => day.sections.map((section) => ({ section, parentId: day.id as string | null, siblings: day.sections }))),
  ];
  const current = sections.find(({ section }) => section.id === source.id);
  if (!current) return { commands: [], error: 'This section no longer exists.' };
  const anchor = target.kind === 'section' ? sections.find(({ section }) => section.id === target.sectionId) : undefined;
  const destination = target.kind === 'day' ? days.find(({ day }) => day.id === target.dayId)?.day : undefined;
  if (!anchor && !destination) return { commands: [], error: 'Drop the section onto another section or day.' };
  if (anchor?.section.id === source.id) return { commands: [], error: null };
  const parentId = anchor ? anchor.parentId : destination!.id;
  const siblings = anchor ? anchor.siblings : destination!.sections;
  const remaining = siblings.filter((section) => section.id !== source.id);
  const index = anchor ? remaining.findIndex((section) => section.id === anchor.section.id) + Number(target.kind === 'section' && target.edge === 'after') : remaining.length;
  if (parentId === current.parentId && current.siblings.indexOf(current.section) === index) return { commands: [], error: null };
  return { commands: [{ type: 'move', id: source.id, parentId, index }], error: null };
}
