import { describe, expect, it } from 'vitest';
import { activeNutritionProgram, dailyNutritionStatus, nextWorkout, trainingProgress } from '@/domain/clientHome';
import { ProgramDraft, type Exercise } from '@/domain/programs/contract';
import type { LoggedSet, SessionStatus, TrainingSession } from '@/domain/training/volume';

const exercise = (id: string, sets: number): Exercise => ({
  id, logicalKey: id, name: id, alternatives: [], groupId: null, demoUrl: null, muscles: [], notes: '',
  prescription: { setCount: { min: sets, max: sets }, targets: [{ effort: null, load: null, rir: null, rpe: null, annotations: [] }] },
});
const day = (id: string, label: string, exercises: Exercise[]) => ({ id, label, scheduledDate: null, sections: [{ id: `${id}-s`, kind: 'main' as const, title: 'Main', instructions: '', exercises }] });

const program = ProgramDraft.parse({
  schemaVersion: 1, service: 'mesocycle', title: 'Block', coachNotes: '', resources: [],
  sharedSections: [{ id: 'warm', kind: 'preparation', title: 'Warm-up', instructions: '', exercises: [exercise('bike', 1)] }],
  weeks: [
    { id: 'w1', index: 1, label: '', startDate: null, days: [day('d1', 'Push', [exercise('press', 2), exercise('fly', 1)]), day('d2', 'Pull', [exercise('row', 2)])] },
    { id: 'w2', index: 2, label: '', startDate: null, days: [day('d3', 'Legs', [exercise('squat', 1)])] },
  ],
});

const set = (exerciseId: string, setNumber: number, reps: number | null = 8): LoggedSet => ({
  id: `${exerciseId}-${setNumber}`, exerciseId, setNumber, loadMode: 'external', loadValue: 100, loadUnit: 'lb', reps, muscles: [], updatedAt: '', updatedByStaff: false,
});
const session = (dayId: string, status: SessionStatus, sets: LoggedSet[] = [], performedOn: string | null = null): TrainingSession => ({
  id: `s-${dayId}`, dayId, revisionId: 'r1', status, performedOn, startedAt: '', completedAt: null, notes: '', updatedAt: '', updatedByStaff: false,
  useSections: false, day: program.weeks.flatMap((w) => w.days).find((d) => d.id === dayId)!, sets, feedback: [],
});
const today = '2026-11-17';

describe('next workout', () => {
  it('starts at the first day', () => {
    expect(nextWorkout(program, [], today)).toMatchObject({ state: 'not_started', dayId: 'd1', weekId: 'w1', label: 'Week 1 · Day 1 · Push', exercises: 2, logged: 0 });
  });

  it('prefers a started workout and counts fully logged exercises only', () => {
    const started = session('d2', 'in_progress', [set('row', 1)]);
    expect(nextWorkout(program, [started], today)).toMatchObject({ state: 'in_progress', dayId: 'd2', logged: 0, exercises: 1 });
    const logged = session('d1', 'in_progress', [set('press', 1), set('press', 2), set('fly', 1, null)]);
    expect(nextWorkout(program, [logged], today)).toMatchObject({ dayId: 'd1', logged: 1, exercises: 2 });
  });

  it('keeps a workout finished today, then moves on', () => {
    const done = session('d1', 'completed', [], today);
    expect(nextWorkout(program, [done], today)).toMatchObject({ state: 'done_today', dayId: 'd1' });
    expect(nextWorkout(program, [{ ...done, performedOn: '2026-11-16' }], today)).toMatchObject({ state: 'not_started', dayId: 'd2', label: 'Week 1 · Day 2 · Pull' });
  });

  it('skipped days are passed; a finished program is complete', () => {
    expect(nextWorkout(program, [session('d1', 'skipped')], today)).toMatchObject({ dayId: 'd2' });
    const all = [session('d1', 'completed', [], '2026-11-10'), session('d2', 'skipped'), session('d3', 'completed', [], '2026-11-12')];
    expect(nextWorkout(program, all, today)).toEqual({ state: 'complete' });
    expect(nextWorkout({ ...program, weeks: [] }, [], today)).toBeNull();
  });
});

describe('training progress', () => {
  it('counts completed workouts and the current week', () => {
    expect(trainingProgress(program, [], today)).toEqual({ week: 1, weekCount: 2, completed: 0, total: 3 });
    const sessions = [session('d1', 'completed', [], '2026-11-10'), session('d2', 'skipped')];
    expect(trainingProgress(program, sessions, today)).toEqual({ week: 2, weekCount: 2, completed: 1, total: 3 });
  });
});

describe('daily nutrition', () => {
  const weigh = (measured_on: string, weight: number | null) => ({ measured_on, weight, unit: 'lb' as const }) as never;
  const eat = (activity_on: string, intake: number | null, output: number | null) => ({ activity_on, intake, output, notes: '' }) as never;

  it('needs today’s weigh-in and yesterday’s calories', () => {
    expect(dailyNutritionStatus({ today, weights: [], entries: [] })).toEqual({ weighed: false, logged: false, done: false });
    expect(dailyNutritionStatus({ today, weights: [weigh(today, 180)], entries: [eat('2026-11-16', 2200, 2500)] }).done).toBe(true);
    // Calories dated today belong to tomorrow's check; a missing output is unanswered.
    expect(dailyNutritionStatus({ today, weights: [weigh(today, 180)], entries: [eat(today, 2200, 2500)] }).logged).toBe(false);
    expect(dailyNutritionStatus({ today, weights: [weigh(today, null)], entries: [eat('2026-11-16', 0, null)] })).toEqual({ weighed: false, logged: false, done: false });
    expect(dailyNutritionStatus({ today, weights: [], entries: [eat('2026-11-16', 0, 0)] }).logged).toBe(true);
  });

  it('finds the program covering today', () => {
    const p = (id: string, start_date: string, week_count: number, archived_at: string | null = null) => ({ id, start_date, week_count, archived_at });
    expect(activeNutritionProgram([p('old', '2026-09-01', 4), p('now', '2026-11-16', 1)], today)?.id).toBe('now');
    expect(activeNutritionProgram([p('now', '2026-11-16', 1, '2026-11-17')], today)).toBeUndefined();
    expect(activeNutritionProgram([p('end', '2026-11-11', 1)], today)?.id).toBe('end');
    expect(activeNutritionProgram([p('gone', '2026-11-10', 1)], today)).toBeUndefined();
  });
});
