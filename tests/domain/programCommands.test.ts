import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  applyReversibleCommands,
  applyCommands,
  newDay,
  newExercise,
  newWeek,
  type CommandResult,
  type DraftCommand,
} from '@/domain/programs/commands';
import { ProgramDraft, type Exercise, type SetTarget } from '@/domain/programs/contract';

const target = (overrides: Partial<SetTarget> = {}): SetTarget => ({
  effort: { kind: 'reps', reps: { min: 8, max: 12 }, perSide: false },
  load: { mode: 'external', value: { min: 100, max: 100 }, unit: 'lb' },
  rir: { min: 1, max: 2 },
  rpe: null,
  annotations: [],
  ...overrides,
});

const exercise = (id: string, name: string, groupId: string | null = null): Exercise => ({
  id,
  logicalKey: name.toLowerCase().replace(/ /g, '-'),
  name,
  alternatives: [{ id: `${id}-alt`, name: `${name} (machine)` }],
  groupId,
  demoUrl: null, muscles: [],
  notes: '',
  prescription: { setCount: { min: 3, max: 3 }, targets: [target()] },
});

const draft = (): ProgramDraft => ({
  schemaVersion: 1,
  service: 'mesocycle',
  title: 'Block',
  coachNotes: '',
  sharedSections: [{ id: 'warmup', kind: 'preparation', title: 'Warm-up', instructions: '', exercises: [] }],
  resources: [{ id: 'r1', title: 'Guide', body: '', url: null }],
  weeks: [
    {
      id: 'w1',
      index: 1,
      label: 'Week 1',
      startDate: '2026-11-16',
      useSections: false,
      days: [
        {
          id: 'd1',
          label: 'Legs',
          scheduledDate: '2026-11-16',
          sections: [
            {
              id: 's1',
              kind: 'main',
              title: '',
              instructions: '',
              exercises: [exercise('e1', 'Squat', 'g1'), exercise('e2', 'Leg Press', 'g1'), exercise('e3', 'Calf Raise')],
            },
            { id: 's2', kind: 'cooldown', title: 'Stretch', instructions: '', exercises: [] },
          ],
        },
      ],
    },
    { id: 'w2', index: 2, label: 'Week 2', startDate: null, useSections: false, days: [] },
  ],
});

const ids = () => {
  let n = 0;
  return () => `new-${++n}`;
};

function ok(result: CommandResult) {
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message} at ${result.error.path}`);
  // Every successful command leaves a contract-valid draft.
  expect(ProgramDraft.safeParse(result.draft).success).toBe(true);
  return result;
}

const run = (d: ProgramDraft, command: DraftCommand) => ok(applyCommand(d, command, { newId: ids() }));
const exerciseIds = (d: ProgramDraft) => d.weeks[0]!.days[0]!.sections[0]!.exercises.map((e) => e.id);

describe('draft commands: updates', () => {
  it('updates one target and shares every untouched node', () => {
    const before = draft();
    const { draft: after } = run(before, { type: 'updateTarget', exerciseId: 'e2', index: 0, patch: { rir: { min: 0, max: 1 } } });
    const [e1, e2] = after.weeks[0]!.days[0]!.sections[0]!.exercises;
    expect(e2!.prescription.targets[0]!.rir).toEqual({ min: 0, max: 1 });
    expect(e2!.prescription.targets[0]!.load).toEqual(before.weeks[0]!.days[0]!.sections[0]!.exercises[1]!.prescription.targets[0]!.load);
    expect(e1).toBe(before.weeks[0]!.days[0]!.sections[0]!.exercises[0]);
    expect(after.weeks[1]).toBe(before.weeks[1]);
    expect(after.sharedSections).toBe(before.sharedSections);
    // The input draft is never mutated.
    expect(before.weeks[0]!.days[0]!.sections[0]!.exercises[1]!.prescription.targets[0]!.rir).toEqual({ min: 1, max: 2 });
  });

  it('rejects a date where a range belongs and leaves the draft alone', () => {
    const result = applyCommand(draft(), {
      type: 'updateTarget',
      exerciseId: 'e1',
      index: 0,
      patch: { rir: '2026-01-02' as unknown as SetTarget['rir'] },
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'invalid_value', path: 'weeks.0.days.0.sections.0.exercises.0.prescription.rir' } });
  });

  it('keeps null distinct from zero', () => {
    const d = run(draft(), { type: 'updateTarget', exerciseId: 'e1', index: 0, patch: { rir: { min: 0, max: 0 } } }).draft;
    expect(d.weeks[0]!.days[0]!.sections[0]!.exercises[0]!.prescription.targets[0]!.rir).toEqual({ min: 0, max: 0 });
    const cleared = run(d, { type: 'updateTarget', exerciseId: 'e1', index: 0, patch: { rir: null } }).draft;
    expect(cleared.weeks[0]!.days[0]!.sections[0]!.exercises[0]!.prescription.targets[0]!.rir).toBeNull();
  });

  it('rejects fields a command does not own, including logicalKey', () => {
    const result = applyCommand(draft(), { type: 'updateExercise', id: 'e1', patch: { logicalKey: 'x' } as never });
    expect(result).toMatchObject({ ok: false, error: { code: 'invalid_value' } });
  });

  it('renames an exercise without changing its history key', () => {
    const d = run(draft(), { type: 'updateExercise', id: 'e1', patch: { name: 'Back Squat' } }).draft;
    expect(d.weeks[0]!.days[0]!.sections[0]!.exercises[0]).toMatchObject({ name: 'Back Squat', logicalKey: 'squat' });
  });

  it('refuses an id of the wrong kind', () => {
    expect(applyCommand(draft(), { type: 'updateDay', id: 'w1', patch: { label: 'x' } })).toMatchObject({
      ok: false,
      error: { code: 'not_found' },
    });
  });

  it('resizes per-set targets with the set count', () => {
    const perSet = run(draft(), { type: 'setTargets', exerciseId: 'e1', targets: [target(), target(), target({ rir: { min: 0, max: 0 } })] }).draft;
    const four = run(perSet, { type: 'setSetCount', exerciseId: 'e1', setCount: { min: 3, max: 4 } }).draft;
    const targets = four.weeks[0]!.days[0]!.sections[0]!.exercises[0]!.prescription.targets;
    expect(targets).toHaveLength(4);
    expect(targets[3]!.rir).toEqual({ min: 0, max: 0 });
    const two = run(four, { type: 'setSetCount', exerciseId: 'e1', setCount: { min: 2, max: 2 } }).draft;
    expect(two.weeks[0]!.days[0]!.sections[0]!.exercises[0]!.prescription.targets).toHaveLength(2);
    expect(applyCommand(perSet, { type: 'setSetCount', exerciseId: 'e1', setCount: { min: 2.5, max: 2.5 } })).toMatchObject({ ok: false });
  });

  it('rejects per-set targets that do not match the set count', () => {
    expect(applyCommand(draft(), { type: 'setTargets', exerciseId: 'e1', targets: [target(), target()] })).toMatchObject({
      ok: false,
      error: { code: 'invalid_value' },
    });
  });

  it('replaces set count and per-set targets together', () => {
    const prescription = { setCount: { min: 2, max: 2 }, targets: [target(), target({ rir: { min: 0, max: 0 } })] };
    const next = run(draft(), { type: 'setPrescription', exerciseId: 'e1', prescription }).draft;
    expect(next.weeks[0]!.days[0]!.sections[0]!.exercises[0]!.prescription).toEqual(prescription);
    expect(
      applyCommand(draft(), { type: 'setPrescription', exerciseId: 'e1', prescription: { setCount: { min: 3, max: 3 }, targets: [target(), target()] } }),
    ).toMatchObject({ ok: false, error: { code: 'invalid_value' } });
  });
});

describe('draft commands: structure', () => {
  it('reorders within a section and moves across sections', () => {
    const reordered = run(draft(), { type: 'move', id: 'e3', parentId: 's1', index: 0 }).draft;
    expect(exerciseIds(reordered)).toEqual(['e3', 'e1', 'e2']);
    const moved = run(reordered, { type: 'move', id: 'e1', parentId: 's2' }).draft;
    expect(exerciseIds(moved)).toEqual(['e3', 'e2']);
    expect(moved.weeks[0]!.days[0]!.sections[1]!.exercises.map((e) => e.id)).toEqual(['e1']);
  });

  it('moves a section between a day and the shared sections', () => {
    const d = run(draft(), { type: 'move', id: 's2', parentId: null, index: 0 }).draft;
    expect(d.sharedSections.map((s) => s.id)).toEqual(['s2', 'warmup']);
    expect(d.weeks[0]!.days[0]!.sections.map((s) => s.id)).toEqual(['s1']);
  });

  it('refuses a parent that cannot hold the node, and out-of-range positions', () => {
    expect(applyCommand(draft(), { type: 'move', id: 'e1', parentId: 'w1' })).toMatchObject({ ok: false, error: { code: 'invalid_parent' } });
    expect(applyCommand(draft(), { type: 'move', id: 'd1', parentId: null })).toMatchObject({ ok: false, error: { code: 'invalid_parent' } });
    expect(applyCommand(draft(), { type: 'move', id: 'e1', parentId: 's1', index: 3 })).toMatchObject({ ok: false, error: { code: 'invalid_index' } });
  });

  it('inserts new nodes and returns their ids', () => {
    const result = run(draft(), { type: 'insert', parentId: 's2', node: newExercise('Hamstring Stretch', () => 'x1') });
    expect(result.createdId).toBe('x1');
    expect(result.draft.weeks[0]!.days[0]!.sections[1]!.exercises[0]).toMatchObject({
      name: 'Hamstring Stretch',
      logicalKey: 'hamstring-stretch',
      prescription: { setCount: null, targets: [] },
    });
  });

  it('refuses ids already in the draft', () => {
    expect(applyCommand(draft(), { type: 'insert', parentId: 'w2', node: newDay('Arms', () => 'd1') })).toMatchObject({
      ok: false,
      error: { code: 'duplicate_id' },
    });
  });

  it('renumbers weeks after inserting, moving or removing one', () => {
    const inserted = run(draft(), { type: 'insert', parentId: null, index: 0, node: newWeek('Intro', () => 'w0') }).draft;
    expect(inserted.weeks.map((w) => [w.id, w.index])).toEqual([['w0', 1], ['w1', 2], ['w2', 3]]);
    const moved = run(inserted, { type: 'move', id: 'w0', parentId: null }).draft;
    expect(moved.weeks.map((w) => [w.id, w.index])).toEqual([['w1', 1], ['w2', 2], ['w0', 3]]);
    const removed = run(moved, { type: 'remove', id: 'w1' }).draft;
    expect(removed.weeks.map((w) => [w.id, w.index])).toEqual([['w2', 1], ['w0', 2]]);
  });

  it('duplicates a week with fresh ids, kept history keys, separate groups and no dates', () => {
    const before = draft();
    const { draft: d, createdId } = run(before, { type: 'duplicate', id: 'w1' });
    expect(d.weeks.map((w) => w.index)).toEqual([1, 2, 3]);
    const copy = d.weeks[1]!;
    expect(copy.id).toBe(createdId);
    expect(copy).toMatchObject({ label: 'Week 1', startDate: null });
    expect(copy.days[0]!.scheduledDate).toBeNull();

    const originalIds = new Set(JSON.stringify(before).match(/"id":"[^"]+"/g));
    const copyIds = JSON.stringify(copy).match(/"id":"[^"]+"/g)!;
    expect(copyIds.filter((id) => originalIds.has(id))).toEqual([]);

    const [c1, c2, c3] = copy.days[0]!.sections[0]!.exercises;
    expect([c1!.logicalKey, c2!.logicalKey, c3!.logicalKey]).toEqual(['squat', 'leg-press', 'calf-raise']);
    expect(c1!.groupId).toBe(c2!.groupId);
    expect(c1!.groupId).not.toBe('g1');
    expect(c3!.groupId).toBeNull();
    expect(c1!.prescription).toEqual(before.weeks[0]!.days[0]!.sections[0]!.exercises[0]!.prescription);
  });

  it('duplicates a single exercise into the same group, right after the original', () => {
    const { draft: d, createdId } = run(draft(), { type: 'duplicate', id: 'e1' });
    expect(exerciseIds(d)).toEqual(['e1', createdId, 'e2', 'e3']);
    expect(d.weeks[0]!.days[0]!.sections[0]!.exercises[1]!.groupId).toBe('g1');
  });

  it('removes a node with its contents', () => {
    const d = run(draft(), { type: 'remove', id: 's1' }).draft;
    expect(d.weeks[0]!.days[0]!.sections.map((s) => s.id)).toEqual(['s2']);
    expect(applyCommand(d, { type: 'updateExercise', id: 'e1', patch: { notes: 'x' } })).toMatchObject({ ok: false });
  });
});

describe('draft commands: batches', () => {
  it('applies a batch atomically and reports the failing command', () => {
    const before = draft();
    const result = applyCommands(before, [
      { type: 'updateTarget', exerciseId: 'e1', index: 0, patch: { rpe: { min: 7, max: 8 } } },
      { type: 'updateTarget', exerciseId: 'e2', index: 0, patch: { rpe: { min: 7, max: 11 } } },
    ]);
    expect(result).toMatchObject({ ok: false, commandIndex: 1, error: { code: 'invalid_value' } });
    expect(before.weeks[0]!.days[0]!.sections[0]!.exercises[0]!.prescription.targets[0]!.rpe).toBeNull();
  });

  it('collects created ids across a batch', () => {
    const result = applyCommands(draft(), [{ type: 'duplicate', id: 'd1' }, { type: 'duplicate', id: 'r1' }], { newId: ids() });
    if (!result.ok) throw new Error(result.error.message);
    expect(result.createdIds).toHaveLength(2);
    expect(result.draft.weeks[0]!.days[1]!.id).toBe(result.createdIds[0]);
    expect(result.draft.resources[1]!.id).toBe(result.createdIds[1]);
  });
});


describe('reversible draft batches (FR-06)', () => {
  const commands: DraftCommand[] = [
    { type: 'updateProgram', patch: { title: 'Changed', programTheme: 'Strength and size', coachNotes: 'Note' } },
    { type: 'updateWeek', id: 'w1', patch: { startDate: null, label: 'Updated week' } },
    { type: 'updateDay', id: 'd1', patch: { label: 'Updated day', scheduledDate: null } },
    { type: 'updateSection', id: 's1', patch: { instructions: 'Rest', kind: 'other' } },
    { type: 'updateExercise', id: 'e1', patch: { name: 'Renamed', alternatives: [], groupId: null } },
    { type: 'updateResource', id: 'r1', patch: { title: 'Updated resource', body: 'Text' } },
    { type: 'setSetCount', exerciseId: 'e1', setCount: { min: 2, max: 2 } },
    { type: 'updateTarget', exerciseId: 'e1', index: 0, patch: { rir: null } },
    { type: 'setTargets', exerciseId: 'e1', targets: [] },
    { type: 'setPrescription', exerciseId: 'e1', prescription: { setCount: null, targets: [] } },
    { type: 'insert', parentId: 's1', node: newExercise('New movement', () => 'inserted') },
    { type: 'move', id: 'e1', parentId: 's2' },
    { type: 'move', id: 'w1', parentId: null, index: 1 },
    { type: 'duplicate', id: 'w1' },
    { type: 'remove', id: 'w1' },
  ];
  it.each(commands)('restores the exact document and ids for $type', (command) => {
    const before = draft();
    const changed = applyReversibleCommands(before, [command], { newId: ids() });
    expect(changed.ok).toBe(true);
    if (!changed.ok) return;
    const undone = applyCommands(changed.draft, changed.entry.undo);
    expect(undone).toMatchObject({ ok: true, draft: before });
    if (!undone.ok) return;
    expect(applyCommands(undone.draft, changed.entry.redo)).toMatchObject({ ok: true, draft: changed.draft });
    expect(applyCommands(before, changed.commands)).toMatchObject({ ok: true, draft: changed.draft });
  });

  it('undoes a batch in reverse order, including per-set values removed by a resize', () => {
    const before = draft();
    before.weeks[0]!.days[0]!.sections[0]!.exercises[0]!.prescription.targets = [target(), target({ rir: null }), target({ rir: { min: 0, max: 0 } })];
    const changed = applyReversibleCommands(before, [
      { type: 'setSetCount', exerciseId: 'e1', setCount: { min: 1, max: 1 } },
      { type: 'updateExercise', id: 'e1', patch: { name: 'Changed', notes: 'Changed notes' } },
      { type: 'remove', id: 's1' },
    ]);
    expect(changed.ok).toBe(true);
    if (!changed.ok) return;
    expect(applyCommands(changed.draft, changed.entry.undo)).toMatchObject({ ok: true, draft: before });
  });

  it('replays a duplicate followed by edits and undo with stable descendant ids', () => {
    const before = draft();
    const duplicate = applyReversibleCommands(before, [{ type: 'duplicate', id: 'w1' }], { newId: ids() });
    if (!duplicate.ok) throw new Error('Duplicate failed');
    const exercise = duplicate.draft.weeks[1]!.days[0]!.sections[0]!.exercises[0]!;
    const edit = applyReversibleCommands(duplicate.draft, [{ type: 'updateExercise', id: exercise.id, patch: { notes: 'Changed copy' } }]);
    if (!edit.ok) throw new Error('Edit failed');
    const remote = { ...before, coachNotes: 'Another editor changed this' };
    const replay = applyCommands(remote, [...duplicate.commands, ...edit.commands, ...edit.entry.undo]);
    expect(replay).toMatchObject({ ok: true, draft: { ...duplicate.draft, coachNotes: remote.coachNotes } });
  });

  it('refuses a bad batch without a partial document or history entry', () => {
    const before = draft();
    const result = applyReversibleCommands(before, [
      { type: 'remove', id: 'w1' }, { type: 'updateExercise', id: 'e1', patch: { name: 'Gone' } },
    ]);
    expect(result).toMatchObject({ ok: false, commandIndex: 1 });
    expect(result).not.toHaveProperty('entry');
    expect(before.weeks[0]!.days[0]!.sections[0]!.exercises[0]!.name).toBe('Squat');
  });
});
