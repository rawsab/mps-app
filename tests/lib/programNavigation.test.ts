import { describe, expect, it } from 'vitest';
import { applyCommands, newDay, newExercise, newSection, newWeek } from '@/domain/programs/commands';
import type { ProgramDraft } from '@/domain/programs/contract';
import { programDestinations, publishDestination, rejectedDestination, selectedProgramItem } from '@/features/programs/programNavigation';

function program(): ProgramDraft {
  const week = newWeek('Week 1');
  const day = newDay('Upper body');
  const section = newSection('main', 'Main');
  const exercise = newExercise('Bench press');
  const base: ProgramDraft = { schemaVersion: 1, service: 'mesocycle', title: 'Block', coachNotes: '', sharedSections: [], weeks: [], resources: [] };
  const result = applyCommands(base, [
    { type: 'insert', parentId: null, node: week },
    { type: 'insert', parentId: week.value.id, node: day },
    { type: 'insert', parentId: day.value.id, node: section },
    { type: 'insert', parentId: section.value.id, node: exercise },
  ]);
  if (!result.ok) throw new Error(result.error.message);
  return result.draft;
}

describe('program workspace navigation (FR-05, FR-06)', () => {
  it('opens the first workout by default and keeps explicit destinations', () => {
    const draft = program();
    expect(selectedProgramItem(draft, null)).toBe(draft.weeks[0]!.days[0]!.id);
    expect(selectedProgramItem(draft, 'resources')).toBe('resources');
    expect(selectedProgramItem(draft, draft.weeks[0]!.id)).toBe(draft.weeks[0]!.id);
  });

  it('falls back safely after the selected day or week is removed', () => {
    const draft = program();
    const selectedDay = draft.weeks[0]!.days[0]!.id;
    draft.weeks[0]!.days = [];
    expect(selectedProgramItem(draft, selectedDay)).toBe(draft.weeks[0]!.id);
    draft.weeks = [];
    expect(selectedProgramItem(draft, selectedDay)).toBe('details');
  });

  it('resolves indexed publish issues to stable workout and field ids after reordering', () => {
    const draft = program();
    const originalWeek = draft.weeks[0]!;
    const other = newWeek('Another week');
    if (other.kind !== 'week') throw new Error('Expected week');
    draft.weeks.unshift(other.value);
    const exercise = originalWeek.days[0]!.sections[0]!.exercises[0]!;
    expect(publishDestination(draft, 'weeks.1.days.0.sections.0.exercises.0')).toEqual({ item: originalWeek.days[0]!.id, field: `${exercise.id}:sets` });
    expect(publishDestination(draft, 'weeks.1.days.0.sections.0.exercises.0', 'effort')).toEqual({ item: originalWeek.days[0]!.id, field: `${exercise.id}:effort` });
  });

  it('handles program-level and stale publish paths', () => {
    const draft = program();
    expect(publishDestination(draft, 'title')).toEqual({ item: 'details', field: 'program:title' });
    expect(publishDestination(draft, 'weeks.99.days.0')).toEqual({ item: 'details' });
    expect(publishDestination(draft, 'weeks')).toEqual({ item: 'details' });
  });

  it('finds rejected edits in workouts, shared sections, resources and program settings', () => {
    const draft = program();
    const day = draft.weeks[0]!.days[0]!;
    const section = day.sections[0]!;
    const exercise = section.exercises[0]!;
    expect(rejectedDestination(draft, `${exercise.id}:load`)).toEqual({ item: day.id, field: `${exercise.id}:load` });
    expect(rejectedDestination(draft, `${day.id}:label`).item).toBe(day.id);
    expect(rejectedDestination(draft, 'program:title').item).toBe('details');
    draft.sharedSections.push(section);
    draft.weeks = [];
    expect(rejectedDestination(draft, `${exercise.id}:load`).item).toBe('shared');
    draft.resources.push({ id: 'guide', title: 'Guide', body: '', url: null });
    expect(rejectedDestination(draft, 'guide:url').item).toBe('resources');
  });


  it('links missing day, section and exercise names to their exact fields, including shared sections', () => {
    const doc = program();
    const day = doc.weeks[0]!.days[0]!;
    const section = day.sections[0]!;
    const exercise = section.exercises[0]!;
    expect(publishDestination(doc, 'weeks.0.days.0.label')).toEqual({ item: day.id, field: `${day.id}:label` });
    expect(publishDestination(doc, 'weeks.0.days.0.sections.0.title')).toEqual({ item: day.id, field: `${section.id}:title` });
    expect(publishDestination(doc, 'weeks.0.days.0.sections.0.exercises.0.name')).toEqual({ item: day.id, field: `${exercise.id}:name` });
    doc.sharedSections.push(section);
    expect(publishDestination(doc, 'sharedSections.0.title')).toEqual({ item: 'shared', field: `${section.id}:title` });
    expect(publishDestination(doc, 'sharedSections.0.exercises.0.name')).toEqual({ item: 'shared', field: `${exercise.id}:name` });
  });

  it('includes empty weeks in the outline so a coach can add their first day', () => {
    const draft = program();
    draft.weeks[0]!.days = [];
    expect(programDestinations(draft).map((item) => item.id)).toEqual(['details', 'shared', draft.weeks[0]!.id, 'resources']);
  });
});
