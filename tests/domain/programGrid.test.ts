import { describe, expect, it } from 'vitest';
import { applyCommands } from '@/domain/programs/commands';
import type { Exercise, ProgramDraft, SetTarget } from '@/domain/programs/contract';
import {
  cellText,
  GRID_COLUMNS,
  gridRows,
  parseClipboard,
  planClear,
  planEdits,
  planPaste,
  toClipboard,
  type CellEdit,
  type GridColumnKey,
} from '@/domain/programs/grid';

const target = (overrides: Partial<SetTarget> = {}): SetTarget => ({
  effort: { kind: 'reps', reps: { min: 8, max: 12 }, perSide: false },
  load: { mode: 'external', value: { min: 100, max: 100 }, unit: 'lb' },
  rir: { min: 1, max: 2 },
  rpe: null,
  annotations: ['drop set'],
  ...overrides,
});

const exercise = (id: string, name: string, prescription: Exercise['prescription']): Exercise => ({
  id,
  logicalKey: id,
  name,
  alternatives: [],
  groupId: null,
  demoUrl: null,
  notes: '',
  prescription,
});

const draft = (): ProgramDraft => ({
  schemaVersion: 1,
  service: 'mesocycle',
  title: 'Block',
  coachNotes: '',
  sharedSections: [
    {
      id: 'warm',
      kind: 'preparation',
      title: '',
      instructions: '',
      exercises: [exercise('stretch', 'Couch stretch', { setCount: null, targets: [] })],
    },
  ],
  resources: [],
  weeks: [
    {
      id: 'w1',
      index: 1,
      label: 'Week 1',
      startDate: null,
      days: [
        {
          id: 'd1',
          label: 'Legs',
          scheduledDate: null,
          sections: [
            {
              id: 's1',
              kind: 'main',
              title: 'Main',
              instructions: '',
              exercises: [
                exercise('squat', 'Squat', { setCount: { min: 3, max: 3 }, targets: [target()] }),
                exercise('press', 'Leg press', {
                  setCount: { min: 2, max: 2 },
                  targets: [target(), target({ effort: { kind: 'reps', reps: { min: 6, max: 8 }, perSide: false } })],
                }),
              ],
            },
          ],
        },
      ],
    },
  ],
});

const edit = (exerciseId: string, column: GridColumnKey, text: string): CellEdit => ({ exerciseId, column, text });

function applied(d: ProgramDraft, edits: CellEdit[]) {
  const plan = planEdits(d, edits);
  expect(plan.errors).toEqual([]);
  const result = applyCommands(d, plan.commands);
  if (!result.ok) throw new Error(result.error.message);
  return { plan, draft: result.draft, rows: gridRows(result.draft) };
}

const row = (d: ProgramDraft, id: string) => gridRows(d).find((r) => r.exerciseId === id)!;
const exerciseIn = (d: ProgramDraft, id: string) => row(d, id).exercise;

describe('grid rows and cell text', () => {
  it('lists shared and day exercises with readable cells', () => {
    const rows = gridRows(draft());
    expect(rows.map((r) => [r.dayLabel, r.sectionLabel, r.position, r.exercise.name])).toEqual([
      ['All days', 'Preparation', 1, 'Couch stretch'],
      ['W1 · Legs', 'Main', 1, 'Squat'],
      ['W1 · Legs', 'Main', 2, 'Leg press'],
    ]);
    const squat = rows[1]!;
    expect(GRID_COLUMNS.map((c) => cellText(squat, c.key))).toEqual([
      'W1 · Legs', 'Main', '1', 'Squat', '3', '8-12', '', 'Weight', '100', 'lb', '1-2', '', '',
    ]);
    expect(cellText(rows[2]!, 'effort')).toBe('8-12 / 6-8');
    expect(cellText(rows[2]!, 'load')).toBe('100');
  });
});

describe('planEdits', () => {
  it('keeps RIR 1-2 a numeric range, never a date', () => {
    const { draft: d } = applied(draft(), [edit('squat', 'rir', '2-3')]);
    expect(exerciseIn(d, 'squat').prescription.targets[0]!.rir).toEqual({ min: 2, max: 3 });
    const bad = planEdits(draft(), [edit('squat', 'rir', '2026-01-02')]);
    expect(bad.errors).toEqual([{ exerciseId: 'squat', column: 'rir', message: expect.stringContaining('range') }]);
    expect(bad.commands).toEqual([]);
  });

  it('reports the changed cells and preserves annotations', () => {
    const { plan, draft: d } = applied(draft(), [edit('squat', 'effort', '5'), edit('squat', 'name', 'Back squat')]);
    expect(plan.changes).toEqual([
      { exerciseId: 'squat', column: 'name', before: 'Squat', after: 'Back squat' },
      { exerciseId: 'squat', column: 'effort', before: '8-12', after: '5' },
    ]);
    expect(exerciseIn(d, 'squat').prescription.targets[0]!.annotations).toEqual(['drop set']);
    expect(exerciseIn(d, 'squat').logicalKey).toBe('squat');
  });

  it('parses durations and per side', () => {
    const { draft: d } = applied(draft(), [edit('stretch', 'sets', '1'), edit('stretch', 'effort', '1 min'), edit('stretch', 'perSide', 'yes')]);
    expect(exerciseIn(d, 'stretch').prescription).toEqual({
      setCount: { min: 1, max: 1 },
      targets: [{ effort: { kind: 'duration', seconds: { min: 60, max: 60 }, perSide: true }, load: null, rir: null, rpe: null, annotations: [] }],
    });
    expect(planEdits(draft(), [edit('stretch', 'perSide', 'yes')]).errors[0]!.message).toBe('Add reps or time first');
  });

  it('writes per-set lists and resizes per-set targets with the set count', () => {
    const { draft: d } = applied(draft(), [edit('squat', 'effort', '10 / 8 / 6')]);
    expect(exerciseIn(d, 'squat').prescription.targets.map((t) => t.effort)).toEqual(
      [10, 8, 6].map((n) => ({ kind: 'reps', reps: { min: n, max: n }, perSide: false })),
    );
    const wrong = planEdits(draft(), [edit('squat', 'effort', '10 / 8')]);
    expect(wrong.errors[0]).toMatchObject({ column: 'effort', message: 'Enter one value, or one per set (3)' });

    const { draft: grown } = applied(draft(), [edit('press', 'sets', '3')]);
    expect(cellText(row(grown, 'press'), 'effort')).toBe('8-12 / 6-8 / 6-8');
    // Changing sets and the list together is one consistent row.
    const { draft: both } = applied(draft(), [edit('press', 'sets', '4'), edit('press', 'rpe', '6 / 7 / 8 / 9')]);
    expect(exerciseIn(both, 'press').prescription.targets.map((t) => t.rpe?.min)).toEqual([6, 7, 8, 9]);
  });

  it('builds loads from mode, value and unit without guessing a unit', () => {
    const { draft: d } = applied(draft(), [edit('stretch', 'sets', '2'), edit('stretch', 'load', '20')]);
    expect(exerciseIn(d, 'stretch').prescription.targets[0]!.load).toEqual({ mode: 'external', value: { min: 20, max: 20 }, unit: null });

    const bw = applied(draft(), [edit('squat', 'loadMode', 'BW'), edit('squat', 'load', '+10')]).draft;
    expect(exerciseIn(bw, 'squat').prescription.targets[0]!.load).toEqual({ mode: 'bodyweight', added: { value: 10, unit: 'lb' } });

    const band = applied(draft(), [edit('squat', 'loadMode', 'band'), edit('squat', 'load', 'Red'), edit('squat', 'unit', '')]).draft;
    expect(exerciseIn(band, 'squat').prescription.targets[0]!.load).toEqual({ mode: 'band', label: 'Red' });

    expect(planEdits(draft(), [edit('squat', 'loadMode', 'band')]).errors[0]).toMatchObject({ column: 'loadMode', message: 'Enter the band, such as Red' });
    expect(planEdits(draft(), [edit('squat', 'unit', 'stone')]).errors[0]).toMatchObject({ column: 'unit', message: 'Enter lb or kg' });
    // Assisted keeps the weight it replaces; it's the same shape.
    const assisted = applied(draft(), [edit('squat', 'loadMode', 'assisted')]).draft;
    expect(exerciseIn(assisted, 'squat').prescription.targets[0]!.load).toEqual({ mode: 'assisted', value: { min: 100, max: 100 }, unit: 'lb' });
  });

  it('keeps null distinct from zero', () => {
    const { draft: d } = applied(draft(), [edit('squat', 'rir', '0')]);
    expect(exerciseIn(d, 'squat').prescription.targets[0]!.rir).toEqual({ min: 0, max: 0 });
    const cleared = applied(draft(), [edit('squat', 'rir', '')]).draft;
    expect(exerciseIn(cleared, 'squat').prescription.targets[0]!.rir).toBeNull();
  });

  it('rejects the whole edit when any cell is bad', () => {
    const plan = planEdits(draft(), [edit('squat', 'rir', '3'), edit('press', 'sets', 'three'), edit('squat', 'order', '4')]);
    expect(plan.commands).toEqual([]);
    expect(plan.errors.map((e) => [e.exerciseId, e.column])).toEqual([
      ['squat', 'order'],
      ['press', 'sets'],
    ]);
  });

  it('returns no commands when nothing changes', () => {
    expect(planEdits(draft(), [edit('squat', 'sets', '3'), edit('squat', 'order', '1')])).toEqual({ commands: [], errors: [], changes: [] });
  });

  it('clears target cells but never the name', () => {
    const { draft: d } = applied(draft(), []);
    const plan = planClear(d, [
      { exerciseId: 'squat', column: 'name' },
      { exerciseId: 'squat', column: 'rir' },
      { exerciseId: 'squat', column: 'day' },
    ]);
    expect(plan.changes).toEqual([{ exerciseId: 'squat', column: 'rir', before: '1-2', after: '' }]);
  });
});

describe('planPaste', () => {
  const col = (key: GridColumnKey) => GRID_COLUMNS.findIndex((c) => c.key === key);

  it('applies a rectangle as one batch', () => {
    const d = draft();
    const rows = gridRows(d);
    const plan = planPaste(d, rows, 1, col('sets'), parseClipboard('4\t6-8\n3\t10\n'));
    expect(plan.errors).toEqual([]);
    const result = applyCommands(d, plan.commands);
    if (!result.ok) throw new Error(result.error.message);
    expect(cellText(row(result.draft, 'squat'), 'sets')).toBe('4');
    expect(cellText(row(result.draft, 'press'), 'effort')).toBe('10');
  });

  it('rejects a paste that runs off the grid instead of dropping cells', () => {
    const d = draft();
    const plan = planPaste(d, gridRows(d), 2, col('sets'), [['4'], ['5']]);
    expect(plan.commands).toEqual([]);
    expect(plan.errors[0]!.message).toContain('only 1 × 9 cells');
  });

  it('a bad cell does not shift its neighbours', () => {
    const d = draft();
    const plan = planPaste(d, gridRows(d), 1, col('rir'), [['2026-03-01', '7']]);
    expect(plan.commands).toEqual([]);
    expect(plan.errors).toEqual([expect.objectContaining({ exerciseId: 'squat', column: 'rir' })]);
  });
});

describe('clipboard', () => {
  it('round-trips quoted cells', () => {
    const matrix = [['a\tb', 'say "hi"'], ['line\nbreak', '']];
    expect(parseClipboard(toClipboard(matrix))).toEqual(matrix);
    expect(parseClipboard('1\t2\r\n3\t4\r\n')).toEqual([['1', '2'], ['3', '4']]);
  });
});
