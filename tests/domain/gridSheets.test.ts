import { planGridRowMove, planGridStructureMove } from '@/domain/programs/gridRowMoves';
import { planDuplicateWeek, planInsertGridRow } from '@/domain/programs/gridStructureActions';
import { describe, expect, it } from 'vitest';
import { applyCommands, applyReversibleCommands } from '@/domain/programs/commands';
import type { Exercise, ProgramDraft, Section } from '@/domain/programs/contract';
import { cellText, gridColumns, gridRows, gridSheets, planAddSheetRow, planMoveGridExercise, planPaste, planSetDayFocus } from '@/domain/programs/grid';

const exercise = (id: string, groupId: string | null = null): Exercise => ({
  id, logicalKey: `history-${id}`, name: id, groupId, alternatives: [{ id: `${id}-alt`, name: 'Alternative' }],
  demoUrl: 'https://example.test/demo', muscles: [], notes: 'Keep this note',
  prescription: { setCount: { min: 3, max: 3 }, targets: [{ effort: { kind: 'reps', reps: { min: 8, max: 10 }, perSide: false }, load: null, rir: { min: 1, max: 2 }, rpe: null, annotations: ['pause'] }] },
});
const section = (id: string, exercises: Exercise[] = []): Section => ({ id, kind: 'main', title: id, instructions: 'Keep instructions', exercises });
function draft(): ProgramDraft {
  return {
    schemaVersion: 1, service: 'mesocycle', title: 'Block', coachNotes: '', resources: [],
    sharedSections: [section('shared', [exercise('warmup')])],
    weeks: [
      { id: 'w1', index: 1, label: 'Foundation', startDate: null, useSections: false, days: [{ id: 'd1', label: 'Upper', scheduledDate: '2026-11-16', sections: [section('s1', [exercise('A', 'superset'), exercise('B', 'superset'), exercise('C')])] }] },
      { id: 'w2', index: 2, label: 'Build', startDate: null, useSections: false, days: [{ id: 'd2', label: 'Lower', scheduledDate: null, sections: [section('s2', [exercise('D')])] }] },
      { id: 'w3', index: 3, label: '', startDate: null, useSections: false, days: [] },
    ],
  };
}
let sequence = 0;
const id = () => `new-${++sequence}`;

describe('weekly spreadsheets (FR-05, FR-06)', () => {
  it('keeps shared preparation in one sheet and includes empty weeks in order', () => {
    const sheets = gridSheets(draft());
    expect(sheets.map((sheet) => [sheet.weekId, sheet.label, sheet.rows.map((row) => row.exerciseId)])).toEqual([
      [null, 'Every-workout preparation', ['warmup']], ['w1', 'Week 1', ['A', 'B', 'C']], ['w2', 'Week 2', ['D']], ['w3', 'Week 3', []],
    ]);
  });

  it('rejects a paste spilling into the next week, with no partial changes', () => {
    const doc = draft();
    const sheet = gridSheets(doc).find((sheet) => sheet.weekId === 'w1')!;
    const plan = planPaste(doc, sheet.rows, 2, 4, [['4'], ['5']]);
    expect(plan.errors[0]?.message).toContain('only 1');
    expect(plan.commands).toEqual([]);
    expect(plan.changes).toEqual([]);
    expect(gridRows(doc).find((row) => row.exerciseId === 'D')!.exercise.prescription.setCount).toEqual({ min: 3, max: 3 });
  });

  it('adds an exercise to the requested week rather than the final week', () => {
    const doc = draft();
    const plan = planAddSheetRow(doc, 'w1', id);
    const result = applyReversibleCommands(doc, plan.commands);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const row = gridRows(result.draft).find((row) => row.exerciseId === plan.exerciseId)!;
    expect([row.weekId, row.dayId, row.sectionId]).toEqual(['w1', 'd1', 's1']);
    const undone = applyCommands(result.draft, result.entry.undo);
    expect(undone.ok && undone.draft).toEqual(doc);
  });

  it('creates empty-week scaffolding as one undoable operation', () => {
    const doc = draft();
    const plan = planAddSheetRow(doc, 'w3', id);
    const result = applyReversibleCommands(doc, plan.commands);
    if (!result.ok) throw new Error(result.error.message);
    expect(gridRows(result.draft).find((row) => row.exerciseId === plan.exerciseId)!.weekId).toBe('w3');
    expect(result.draft.weeks[2]!.days).toHaveLength(1);
    const undone = applyCommands(result.draft, result.entry.undo);
    expect(undone.ok && undone.draft).toEqual(doc);
  });

  it('keeps shared row insertion separate and refuses a stale target week atomically', () => {
    const doc = draft();
    doc.sharedSections = [];
    const shared = planAddSheetRow(doc, null, id);
    const result = applyCommands(doc, shared.commands);
    if (!result.ok) throw new Error(result.error.message);
    expect(gridRows(result.draft).find((row) => row.exerciseId === shared.exerciseId)!.weekId).toBeNull();
    expect(result.draft.weeks).toEqual(doc.weeks);
    expect(applyCommands(doc, planAddSheetRow(doc, 'deleted-week', id).commands).ok).toBe(false);
  });

  it('moves a superset intact and restores exact positions and targets on undo', () => {
    const doc = draft();
    const commands = planMoveGridExercise(doc, 'B', 's2');
    expect(commands.map((command) => 'id' in command && command.id)).toEqual(['A', 'B']);
    const result = applyReversibleCommands(doc, commands);
    if (!result.ok) throw new Error(result.error.message);
    const after = gridRows(result.draft);
    expect(after.filter((row) => row.weekId === 'w1').map((row) => row.exerciseId)).toEqual(['C']);
    expect(after.filter((row) => row.weekId === 'w2').map((row) => row.exerciseId)).toEqual(['D', 'A', 'B']);
    expect(after.find((row) => row.exerciseId === 'A')!.exercise).toEqual(exercise('A', 'superset'));
    const undo = applyCommands(result.draft, result.entry.undo);
    expect(undo.ok && undo.draft).toEqual(doc);
    if (!undo.ok) return;
    const redo = applyCommands(undo.draft, result.entry.redo);
    expect(redo.ok && redo.draft).toEqual(result.draft);
  });

  it('moves one ungrouped exercise and rejects invalid destinations without changing the draft', () => {
    const doc = draft();
    expect(planMoveGridExercise(doc, 'C', 's2')).toEqual([{ type: 'move', id: 'C', parentId: 's2' }]);
    expect(planMoveGridExercise(doc, 'C', 's1')).toEqual([]);
    const result = applyCommands(doc, planMoveGridExercise(doc, 'A', 'missing-section'));
    expect(result.ok).toBe(false);
    expect(gridRows(doc).find((row) => row.exerciseId === 'A')!.weekId).toBe('w1');
  });

  it('moves an entire workout between weeks with schedules and contents intact, and undoes it', () => {
    const doc = draft();
    const result = applyReversibleCommands(doc, [{ type: 'move', id: 'd1', parentId: 'w3' }]);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.draft.weeks[0]!.days).toEqual([]);
    expect(result.draft.weeks[2]!.days[0]).toEqual(doc.weeks[0]!.days[0]);
    expect(gridSheets(result.draft).find((sheet) => sheet.weekId === 'w3')!.rows.map((row) => row.exerciseId)).toEqual(['A', 'B', 'C']);
    const undone = applyCommands(result.draft, result.entry.undo);
    expect(undone.ok && undone.draft).toEqual(doc);
  });
});


describe('renaming days inside a spreadsheet (FR-06)', () => {
  it('renames one workout across all its rows and preserves the full document on undo', () => {
    const doc = draft();
    // Equal labels in a different day must not make it part of the rename.
    doc.weeks[1]!.days[0]!.label = 'Upper';
    const plan = planSetDayFocus(doc, 'B', '  Push day  ');
    expect(plan.errors).toEqual([]);
    expect(plan.changes.map((change) => change.exerciseId)).toEqual(['A', 'B', 'C']);
    const result = applyReversibleCommands(doc, plan.commands);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.draft.weeks[0]!.days[0]!.label).toBe('Push day');
    expect(result.draft.weeks[1]!.days[0]!.label).toBe('Upper');
    expect(result.draft.weeks[0]!.days[0]!.sections).toEqual(doc.weeks[0]!.days[0]!.sections);
    const undone = applyCommands(result.draft, result.entry.undo);
    expect(undone.ok && undone.draft).toEqual(doc);
  });

  it('allows blank draft names but refuses shared and missing day destinations', () => {
    const doc = draft();
    for (const [exerciseId, text] of [['warmup', 'Rename shared'], ['missing', 'New name']] as const) {
      const plan = planSetDayFocus(doc, exerciseId, text);
      expect(plan.errors).toHaveLength(1);
      expect(plan.commands).toEqual([]);
    }
    expect(planSetDayFocus(doc, 'A', '  ').commands).toEqual([{ type: 'updateDay', id: 'd1', patch: { label: '' } }]);
    expect(planSetDayFocus(doc, 'A', 'Upper')).toEqual({ commands: [], changes: [], errors: [] });
  });
});

describe('cleared grid content remains a draft (FR-04, FR-06)', () => {
  it('clears names and both merged labels once, blocks publish, and restores everything on undo', async () => {
    const { planClear } = await import('@/domain/programs/grid');
    const { ProgramDraft, validateForPublish } = await import('@/domain/programs/contract');
    const doc = draft();
    const cells = ['A', 'B'].flatMap((exerciseId) => (['day', 'section', 'name'] as const).map((column) => ({ exerciseId, column })));
    const plan = planClear(doc, cells);
    expect(plan.errors).toEqual([]);
    expect(plan.commands.filter((command) => command.type === 'updateDay')).toHaveLength(1);
    expect(plan.commands.filter((command) => command.type === 'updateSection')).toHaveLength(1);
    const result = applyReversibleCommands(doc, plan.commands);
    if (!result.ok) throw new Error(result.error.message);
    expect(ProgramDraft.safeParse(result.draft).success).toBe(true);
    const day = result.draft.weeks[0]!.days[0]!;
    expect(day.label).toBe('');
    expect(day.sections[0]!.title).toBe('');
    expect(day.sections[0]!.exercises.map((exercise) => exercise.name)).toEqual(['', '', 'C']);
    expect(day.sections[0]!.exercises[0]!.logicalKey).toBe('history-A');
    expect(day.sections[0]!.exercises[0]!.prescription).toEqual(doc.weeks[0]!.days[0]!.sections[0]!.exercises[0]!.prescription);
    expect(validateForPublish(result.draft)).toHaveLength(3);
    const undo = applyCommands(result.draft, result.entry.undo);
    expect(undo.ok && undo.draft).toEqual(doc);
    if (!undo.ok) return;
    const redo = applyCommands(undo.draft, result.entry.redo);
    expect(redo.ok && redo.draft).toEqual(result.draft);
  });

  it('allows clearing a whole exercise row including prescription columns', async () => {
    const { GRID_COLUMNS, planClear } = await import('@/domain/programs/grid');
    const doc = draft();
    const plan = planClear(doc, GRID_COLUMNS.map(({ key }) => ({ exerciseId: 'A', column: key })));
    expect(plan.errors).toEqual([]);
    const result = applyCommands(doc, plan.commands);
    if (!result.ok) throw new Error(result.error.message);
    expect(gridRows(result.draft).find((row) => row.exerciseId === 'A')!.exercise.name).toBe('');
    expect(gridRows(result.draft).find((row) => row.exerciseId === 'A')!.position).toBe(1);
  });

  it('clears shared section/exercise names while keeping the derived All days label and order', async () => {
    const { planClear } = await import('@/domain/programs/grid');
    const doc = draft();
    const plan = planClear(doc, (['day', 'section', 'order', 'name'] as const).map((column) => ({ exerciseId: 'warmup', column })));
    const result = applyCommands(doc, plan.commands);
    if (!result.ok) throw new Error(result.error.message);
    const row = gridRows(result.draft)[0]!;
    expect([row.dayLabel, row.sectionLabel, row.exercise.name, row.position]).toEqual(['All days', '', '', 1]);
  });

  it('renames section labels directly, including empty draft labels, preserving exercises', async () => {
    const { planRenameGridSection } = await import('@/domain/programs/grid');
    const doc = draft();
    for (const name of ['New section', '']) {
      const plan = planRenameGridSection(doc, 'B', name);
      expect(plan.errors).toEqual([]);
      const result = applyCommands(doc, plan.commands);
      if (!result.ok) throw new Error(result.error.message);
      expect(result.draft.weeks[0]!.days[0]!.sections[0]!.title).toBe(name);
      expect(result.draft.weeks[0]!.days[0]!.sections[0]!.exercises).toEqual(doc.weeks[0]!.days[0]!.sections[0]!.exercises);
    }
  });
});

describe('day labels within a weekly spreadsheet', () => {
  it('derives the day number and preserves descriptive legacy labels as focus', () => {
    const doc = draft();
    for (const [stored, shown] of [['W1 Day 1', ''], ['W2 · Upper body', 'Upper body'], ['W12 - Day 3', ''], ['Day 1', ''], ['', '']] as const) {
      doc.weeks[0]!.days[0]!.label = stored;
      expect(gridRows(doc).find((row) => row.dayId === 'd1')!.dayLabel).toBe('Day 1');
      expect(gridRows(doc).find((row) => row.dayId === 'd1')!.focus).toBe(shown);
      expect(doc.weeks[0]!.days[0]!.label).toBe(stored);
    }
  });
});

describe('adding a section from an empty weekly sheet', () => {
  it('creates the first day in that week, not shared preparation, in one undoable operation', async () => {
    const { planAddGridStructure } = await import('@/domain/programs/grid');
    const doc = draft();
    const plan = planAddGridStructure(doc, { kind: 'section', dayId: null, weekId: 'w3', sectionKind: 'cooldown', label: 'Stretching' });
    const result = applyReversibleCommands(doc, plan.commands);
    if (!result.ok) throw new Error(result.error.message);
    const added = gridRows(result.draft).find((row) => row.exerciseId === plan.exerciseId)!;
    expect(added.weekId).toBe('w3');
    expect(added.dayLabel).toBe('Day 1');
    expect(added.sectionLabel).toBe('Stretching');
    expect(result.draft.sharedSections).toEqual(doc.sharedSections);
    expect(result.draft.weeks[2]!.days[0]!.sections[0]!.kind).toBe('cooldown');
    const undone = applyCommands(result.draft, result.entry.undo);
    expect(undone.ok && undone.draft).toEqual(doc);
  });

  it('refuses a stale target week without creating structure elsewhere', async () => {
    const { planAddGridStructure } = await import('@/domain/programs/grid');
    const doc = draft();
    const plan = planAddGridStructure(doc, { kind: 'section', dayId: null, weekId: 'missing-week', sectionKind: 'main', label: 'Main' });
    expect(applyCommands(doc, plan.commands).ok).toBe(false);
    expect(doc.weeks[2]!.days).toEqual([]);
    expect(doc.sharedSections).toHaveLength(1);
  });
});


describe('contextual grid structure (FR-06)', () => {
  it.each(['day', 'section', 'name'] as const)('inserts %s siblings above and below with exact undo', (column) => {
    for (const below of [false, true]) {
      const doc = draft();
      const plan = planInsertGridRow(doc, 'B', column, below, id);
      const result = applyReversibleCommands(doc, plan.commands);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const row = gridRows(result.draft).find((row) => row.exerciseId === plan.exerciseId)!;
      expect(row.weekId).toBe('w1');
      const week = result.draft.weeks[0]!;
      if (column === 'day') {
        expect(week.days[Number(below)]!.id).toBe(row.dayId);
        expect(week.days[Number(!below)]!.id).toBe('d1');
      } else if (column === 'section') {
        expect(row.dayId).toBe('d1');
        expect(week.days[0]!.sections[Number(below)]!.id).toBe(row.sectionId);
      } else {
        expect(row.sectionId).toBe('s1');
        expect(week.days[0]!.sections[0]!.exercises[1 + Number(below)]!.id).toBe(plan.exerciseId);
      }
      expect(applyCommands(result.draft, result.entry.undo)).toMatchObject({ ok: true, draft: doc });
    }
  });

  it('appends a fully independent week copy with sequential numbering and reversible history', () => {
    const doc = draft();
    const plan = planDuplicateWeek(doc, 'w1', id);
    const result = applyReversibleCommands(doc, plan.commands);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.weeks.map((week) => week.id)).toEqual(['w1', 'w2', 'w3', plan.weekId]);
    expect(result.draft.weeks.map((week) => week.index)).toEqual([1, 2, 3, 4]);
    const copy = result.draft.weeks.at(-1)!;
    expect(copy.days[0]!.scheduledDate).toBeNull();
    expect(copy.days[0]!.id).not.toBe('d1');
    const exercises = copy.days[0]!.sections[0]!.exercises;
    expect(exercises[0]!.logicalKey).toBe('history-A');
    expect(exercises[0]!.id).not.toBe('A');
    expect(exercises[0]!.groupId).toBe(exercises[1]!.groupId);
    expect(exercises[0]!.groupId).not.toBe('superset');
    expect(applyCommands(result.draft, result.entry.undo)).toMatchObject({ ok: true, draft: doc });
  });
});


describe('dragged exercise rows (FR-06)', () => {
  it('reorders an exercise within its section and recalculates row numbers', () => {
    const doc = draft();
    const plan = planGridRowMove(doc, 'C', { kind: 'exercise', exerciseId: 'A', edge: 'before' });
    const result = applyReversibleCommands(doc, plan.commands);
    expect(plan.error).toBeNull();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(gridRows(result.draft).filter((row) => row.sectionId === 's1').map((row) => [row.exerciseId, row.position])).toEqual([['C', 1], ['A', 2], ['B', 3]]);
    expect(applyCommands(result.draft, result.entry.undo)).toMatchObject({ ok: true, draft: doc });
  });

  it('moves a complete superset as a block within its section with exact undo/redo', () => {
    const doc = draft();
    const plan = planGridRowMove(doc, 'A', { kind: 'exercise', exerciseId: 'C', edge: 'after' });
    const result = applyReversibleCommands(doc, plan.commands);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(gridRows(result.draft).filter((row) => row.sectionId === 's1').map((row) => row.exerciseId)).toEqual(['C', 'A', 'B']);
    const undone = applyCommands(result.draft, result.entry.undo);
    expect(undone).toMatchObject({ ok: true, draft: doc });
    if (undone.ok) expect(applyCommands(undone.draft, result.entry.redo)).toMatchObject({ ok: true, draft: result.draft });
  });

  it('moves into another day/week without changing exercise identities or prescriptions', () => {
    const doc = draft();
    const original = doc.weeks[0]!.days[0]!.sections[0]!.exercises.slice(0, 2);
    const plan = planGridRowMove(doc, 'B', { kind: 'exercise', exerciseId: 'D', edge: 'after' });
    const result = applyReversibleCommands(doc, plan.commands);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const moved = gridRows(result.draft).filter((row) => row.sectionId === 's2');
    expect(moved.map((row) => [row.exerciseId, row.position, row.dayId])).toEqual([['D', 1, 'd2'], ['A', 2, 'd2'], ['B', 3, 'd2']]);
    expect(moved.slice(1).map((row) => row.exercise)).toEqual(original);
    expect(gridRows(result.draft).find((row) => row.exerciseId === 'C')!.position).toBe(1);
    expect(applyCommands(result.draft, result.entry.undo)).toMatchObject({ ok: true, draft: doc });
  });

  it('supports an empty section and scaffolds only a section for an existing empty day', () => {
    for (const kind of ['section', 'day'] as const) {
      const doc = draft();
      doc.weeks[1]!.days[0]!.sections.push(section('empty-section'));
      doc.weeks[2]!.days.push({ id: 'empty-day', label: '', scheduledDate: null, sections: [] });
      const plan = planGridRowMove(doc, 'C', kind === 'section' ? { kind, sectionId: 'empty-section' } : { kind, dayId: 'empty-day' }, id);
      const result = applyReversibleCommands(doc, plan.commands);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const row = gridRows(result.draft).find((row) => row.exerciseId === 'C')!;
      expect(row.position).toBe(1);
      if (kind === 'section') expect(row.sectionId).toBe('empty-section');
      else expect(row.dayId).toBe('empty-day');
      expect(applyCommands(result.draft, result.entry.undo)).toMatchObject({ ok: true, draft: doc });
    }
  });

  it('does not split a target superset or change order when dropped onto the source group', () => {
    const doc = draft();
    const plan = planGridRowMove(doc, 'C', { kind: 'exercise', exerciseId: 'A', edge: 'after' });
    expect(plan.commands).toEqual([]);
    expect(planGridRowMove(doc, 'A', { kind: 'exercise', exerciseId: 'B', edge: 'after' }).commands).toEqual([]);
    const result = applyCommands(doc, planGridRowMove(doc, 'D', { kind: 'exercise', exerciseId: 'B', edge: 'before' }).commands);
    expect(result.ok && gridRows(result.draft).filter((row) => row.sectionId === 's1').map((row) => row.exerciseId)).toEqual(['D', 'A', 'B', 'C']);
  });

  it('refuses stale destinations without creating or moving anything', () => {
    const plan = planGridRowMove(draft(), 'C', { kind: 'day', dayId: 'missing' }, id);
    expect(plan.commands).toEqual([]);
    expect(plan.error).toContain('no longer exists');
  });
});


it('pastes Exercise, RIR goal, Muscles and Sets in mesocycle display order without changing personal-training order', () => {
  const doc = draft();
  const columns = gridColumns('mesocycle');
  const start = columns.findIndex((column) => column.key === 'name');
  const plan = planPaste(doc, gridSheets(doc).find((sheet) => sheet.weekId === 'w1')!.rows, 0, start, [['Front squat', '2', 'Quads, glutes', '4']], columns);
  expect(plan.errors).toEqual([]);
  const result = applyCommands(doc, plan.commands);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  const row = gridRows(result.draft).find((row) => row.exerciseId === 'A')!;
  expect([cellText(row, 'rir'), cellText(row, 'name'), cellText(row, 'muscles'), cellText(row, 'sets')]).toEqual(['2', 'Front squat', 'Quads, glutes', '4']);
  expect(columns.slice(start + 1, start + 3).map((column) => column.label)).toEqual(['RIR goal', 'Muscles']);
  const personal = gridColumns('personal_training');
  expect(personal.some((column) => column.key === 'muscles')).toBe(false);
  expect(personal.findIndex((column) => column.key === 'rir')).toBeGreaterThan(personal.findIndex((column) => column.key === 'name'));
});


describe('dragged days and sections (FR-06)', () => {
  it('reorders sections without changing their full contents and undoes exactly', () => {
    const doc = draft();
    doc.weeks[0]!.days[0]!.sections.push(section('second', [exercise('E')]));
    const plan = planGridStructureMove(doc, { kind: 'section', id: 's1' }, { kind: 'section', sectionId: 'second', edge: 'after' });
    const result = applyReversibleCommands(doc, plan.commands);
    expect(plan.error).toBeNull();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.weeks[0]!.days[0]!.sections.map((section) => section.id)).toEqual(['second', 's1']);
    expect(result.draft.weeks[0]!.days[0]!.sections[1]).toEqual(doc.weeks[0]!.days[0]!.sections[0]);
    expect(applyCommands(result.draft, result.entry.undo)).toMatchObject({ ok: true, draft: doc });
  });

  it('moves a section into an existing empty day or before a section in another day', () => {
    for (const target of [{ kind: 'day', dayId: 'empty-day' }, { kind: 'section', sectionId: 's2', edge: 'before' }] as const) {
      const doc = draft();
      doc.weeks[2]!.days.push({ id: 'empty-day', label: '', scheduledDate: null, sections: [] });
      const plan = planGridStructureMove(doc, { kind: 'section', id: 's1' }, target);
      const result = applyReversibleCommands(doc, plan.commands);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const expectedDay = target.kind === 'day' ? 'empty-day' : 'd2';
      expect(gridRows(result.draft).filter((row) => row.sectionId === 's1').map((row) => row.dayId)).toEqual([expectedDay, expectedDay, expectedDay]);
      if (target.kind === 'section') expect(result.draft.weeks[1]!.days[0]!.sections.map((section) => section.id)).toEqual(['s1', 's2']);
      expect(applyCommands(result.draft, result.entry.undo)).toMatchObject({ ok: true, draft: doc });
    }
  });

  it('reorders days, derives their new numbers and restores order on Undo/Redo', () => {
    const doc = draft();
    doc.weeks[0]!.days.push({ id: 'third-day', label: 'Pull', scheduledDate: null, sections: [section('third-section', [exercise('E')])] });
    const plan = planGridStructureMove(doc, { kind: 'day', id: 'd1' }, { kind: 'day', dayId: 'third-day', edge: 'after' });
    const result = applyReversibleCommands(doc, plan.commands);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.weeks[0]!.days.map((day) => day.id)).toEqual(['third-day', 'd1']);
    expect(gridRows(result.draft).find((row) => row.exerciseId === 'A')!.dayLabel).toBe('Day 2');
    expect(gridRows(result.draft).find((row) => row.exerciseId === 'E')!.dayLabel).toBe('Day 1');
    expect(result.draft.weeks[0]!.days[1]).toEqual(doc.weeks[0]!.days[0]);
    const undone = applyCommands(result.draft, result.entry.undo);
    expect(undone).toMatchObject({ ok: true, draft: doc });
    if (undone.ok) expect(applyCommands(undone.draft, result.entry.redo)).toMatchObject({ ok: true, draft: result.draft });
  });

  it('moves a day into an empty week and rejects missing or unchanged destinations', () => {
    const doc = draft();
    const plan = planGridStructureMove(doc, { kind: 'day', id: 'd1' }, { kind: 'week', weekId: 'w3' });
    const result = applyReversibleCommands(doc, plan.commands);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.weeks[0]!.days).toEqual([]);
    expect(result.draft.weeks[2]!.days).toEqual(doc.weeks[0]!.days);
    expect(applyCommands(result.draft, result.entry.undo)).toMatchObject({ ok: true, draft: doc });
    expect(planGridStructureMove(doc, { kind: 'day', id: 'd1' }, { kind: 'day', dayId: 'd1', edge: 'before' }).commands).toEqual([]);
    expect(planGridStructureMove(doc, { kind: 'section', id: 's1' }, { kind: 'section', sectionId: 's1', edge: 'after' }).commands).toEqual([]);
    expect(planGridStructureMove(doc, { kind: 'section', id: 's1' }, { kind: 'day', dayId: 'missing' }).error).not.toBeNull();
    expect(planGridStructureMove(doc, { kind: 'day', id: 'd1' }, { kind: 'week', weekId: 'missing' }).commands).toEqual([]);
  });
});
