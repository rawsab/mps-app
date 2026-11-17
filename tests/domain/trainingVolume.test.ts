import { describe, expect, it } from 'vitest';
import { ProgramDraft, type Exercise } from '@/domain/programs/contract';
import { dayMuscleChanges, dayVolume, formatChange, type LoggedSet, type TrainingSession } from '@/domain/training/volume';

const exercise = (id: string, muscles: string[], sets: number): Exercise => ({
  id, logicalKey: id, name: id, alternatives: [], groupId: null, demoUrl: null, muscles, notes: '',
  prescription: { setCount: { min: sets, max: sets }, targets: [{ effort: null, load: null, rir: null, rpe: null, annotations: [] }] },
});
const day = (id: string, exercises: Exercise[]) => ({ id, label: id, scheduledDate: null, sections: [{ id: `${id}-s`, kind: 'main' as const, title: 'Main', instructions: '', exercises }] });

const program = ProgramDraft.parse({
  schemaVersion: 1, service: 'mesocycle', title: 'Block', coachNotes: '', sharedSections: [], resources: [],
  weeks: [
    { id: 'w1', index: 1, label: '', startDate: null, days: [
      day('legs1', [exercise('squat', ['Quads', 'Glutes'], 3), exercise('curl', ['Hamstrings'], 2)]),
      day('push1', [exercise('press', ['Chest'], 3)]),
      day('legs2', [exercise('lunge', ['quads'], 3)]),
    ] },
    { id: 'w2', index: 2, label: '', startDate: null, days: [day('legs3', [exercise('squat', ['Quads', 'Glutes'], 4)])] },
  ],
});

let n = 0;
const set = (exerciseId: string, muscles: string[], reps: number | null): LoggedSet => ({
  id: `set-${n++}`, exerciseId, setNumber: 1, loadMode: 'external', loadValue: 100, loadUnit: 'lb', reps, muscles, updatedAt: '', updatedByStaff: false,
});
const session = (dayId: string, sets: LoggedSet[]): TrainingSession => ({
  id: `session-${dayId}`, dayId, revisionId: 'r1', status: 'in_progress', performedOn: null, startedAt: '', completedAt: null, notes: '', updatedAt: '',
  updatedByStaff: false, useSections: false, day: program.weeks.flatMap((w) => w.days).find((d) => d.id === dayId)!, sets,
});

describe('mesocycle set totals', () => {
  it('counts each performed set once for every listed muscle', () => {
    const legs = program.weeks[0]!.days[0]!;
    const volume = dayVolume(legs, [set('squat', ['Quads', 'Glutes'], 10), set('squat', ['Quads', 'Glutes'], 9), set('curl', ['Hamstrings'], 12)]);
    expect(volume.muscles).toEqual([
      { key: 'quads', name: 'Quads', planned: 3, logged: 2 },
      { key: 'glutes', name: 'Glutes', planned: 3, logged: 2 },
      { key: 'hamstrings', name: 'Hamstrings', planned: 2, logged: 1 },
    ]);
    expect([volume.planned, volume.logged]).toEqual([5, 3]);
  });

  it('does not count a set without reps; zero reps is a performed set', () => {
    const legs = program.weeks[0]!.days[0]!;
    expect(dayVolume(legs, [set('curl', ['Hamstrings'], null), set('curl', ['Hamstrings'], 0)]).logged).toBe(1);
  });
});

describe('change since the muscle was last trained', () => {
  it('compares with the last earlier day that trained the muscle, matching names case-insensitively', () => {
    const sessions = [
      session('legs1', [set('squat', ['Quads', 'Glutes'], 10), set('squat', ['Quads', 'Glutes'], 10)]),
      session('push1', [set('press', ['Chest'], 8)]),
      session('legs2', [set('lunge', ['quads'], 10), set('lunge', ['quads'], 10), set('lunge', ['quads'], 10)]),
    ];
    const result = dayMuscleChanges(program, sessions, 'legs2')!;
    expect(result.muscles).toEqual([expect.objectContaining({ key: 'quads', logged: 3, change: 1, comparedTo: { dayId: 'legs1', label: 'Week 1 · Day 1 · legs1', logged: true } })]);
  });

  it('crosses weeks and reports a drop as negative', () => {
    const sessions = [
      session('legs2', [set('lunge', ['quads'], 10), set('lunge', ['quads'], 10), set('lunge', ['quads'], 10)]),
      session('legs3', [set('squat', ['Quads', 'Glutes'], 10)]),
    ];
    const muscles = dayMuscleChanges(program, sessions, 'legs3')!.muscles;
    expect(muscles.find((m) => m.key === 'quads')).toMatchObject({ change: -2, comparedTo: { dayId: 'legs2' } });
    // Glutes were last trained on legs1, which has no log: missing, not -0.
    expect(muscles.find((m) => m.key === 'glutes')).toMatchObject({ change: null, comparedTo: { dayId: 'legs1', logged: false } });
  });

  it('has no change for the first day a muscle is trained or for a day without a log', () => {
    expect(dayMuscleChanges(program, [], 'legs1')!.muscles.every((m) => m.change === null && m.comparedTo === null)).toBe(true);
    expect(dayMuscleChanges(program, [session('legs1', [])], 'legs2')!.muscles[0]).toMatchObject({ change: null, comparedTo: { logged: true } });
  });

  it('formats changes with signs and missing values as a dash', () => {
    expect([formatChange(2), formatChange(-1), formatChange(0), formatChange(null)]).toEqual(['+2', '−1', '0', '—']);
  });
});
