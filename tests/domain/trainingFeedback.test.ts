import { describe, expect, it } from 'vitest';
import { ProgramDraft, type Exercise } from '@/domain/programs/contract';
import { dayFeedback, EMPTY_ANSWERS, progressionGuidance, stimulusGuidance, stimulusScore } from '@/domain/training/feedback';
import type { MuscleFeedback, TrainingSession } from '@/domain/training/volume';

const exercise = (id: string, muscles: string[]): Exercise => ({
  id, logicalKey: id, name: id, alternatives: [], groupId: null, demoUrl: null, muscles, notes: '',
  prescription: { setCount: { min: 3, max: 3 }, targets: [{ effort: null, load: null, rir: null, rpe: null, annotations: [] }] },
});
const day = (id: string, exercises: Exercise[]) => ({ id, label: id, scheduledDate: null, sections: [{ id: `${id}-s`, kind: 'main' as const, title: 'Main', instructions: '', exercises }] });

const program = ProgramDraft.parse({
  schemaVersion: 1, service: 'mesocycle', title: 'Block', coachNotes: '', sharedSections: [], resources: [],
  weeks: [
    { id: 'w1', index: 1, label: '', startDate: null, days: [day('legs1', [exercise('squat', ['Quads', 'Glutes'])]), day('push1', [exercise('press', ['Chest'])])] },
    { id: 'w2', index: 2, label: '', startDate: null, days: [day('legs2', [exercise('squat', ['quads'])])] },
  ],
});

const session = (dayId: string, feedback: MuscleFeedback[] = []): TrainingSession => ({
  id: `session-${dayId}`, dayId, revisionId: 'r1', status: 'in_progress', performedOn: null, startedAt: '', completedAt: null, notes: '', updatedAt: '',
  updatedByStaff: false, useSections: false, day: program.weeks.flatMap((w) => w.days).find((d) => d.id === dayId)!, sets: [], feedback,
});

describe('stimulus and progression grading', () => {
  it('scores stimulus only when all three answers exist; zero is an answer', () => {
    expect(stimulusScore({ ...EMPTY_ANSWERS, challenge: 2, pump: 0 })).toBeNull();
    expect(stimulusScore({ ...EMPTY_ANSWERS, challenge: 0, pump: 0, disruption: 0 })).toBe(0);
    expect(stimulusScore({ ...EMPTY_ANSWERS, challenge: 3, pump: 2, disruption: 2 })).toBe(7);
  });

  it('grades stimulus bands', () => {
    expect([null, 0, 3, 4, 6, 7, 9].map(stimulusGuidance)).toEqual([
      null, 'Increase volume by two to four sets', 'Increase volume by two to four sets',
      'Increase volume normally', 'Increase volume normally', 'Drop volume', 'Drop volume',
    ]);
  });

  it('reads soreness rows by performance columns', () => {
    expect(progressionGuidance({ ...EMPTY_ANSWERS, soreness: 0, performance: 0 })).toBe('Add 1–3 sets');
    expect(progressionGuidance({ ...EMPTY_ANSWERS, soreness: 1, performance: 1 })).toBe('Add 0–1 sets');
    expect(progressionGuidance({ ...EMPTY_ANSWERS, soreness: 0, performance: 3 })).toBe('Recovery');
    expect(progressionGuidance({ ...EMPTY_ANSWERS, soreness: 2, performance: null })).toBeNull();
  });
});

describe('questions for a day', () => {
  it('asks stimulus for every muscle and progression only after an earlier day trained it', () => {
    const first = dayFeedback(program, [], 'legs1');
    expect(first.map((m) => [m.key, m.progression])).toEqual([['quads', null], ['glutes', null]]);
  });

  it('asks progression across weeks and links the earlier session when it is logged', () => {
    expect(dayFeedback(program, [], 'legs2')[0]!.progression).toEqual({ label: 'Week 1 · Day 1 · legs1', sessionId: null });
    expect(dayFeedback(program, [session('legs1')], 'legs2')[0]!.progression).toMatchObject({ sessionId: 'session-legs1' });
  });

  it('loads saved answers, keeping nulls', () => {
    const saved: MuscleFeedback = { muscleKey: 'chest', muscleName: 'Chest', challenge: 0, pump: null, disruption: 2, soreness: null, performance: null, comparedSessionId: null, updatedAt: '', updatedByStaff: true };
    expect(dayFeedback(program, [session('push1', [saved])], 'push1')[0]).toMatchObject({ answers: { challenge: 0, pump: null, disruption: 2 }, saved });
  });
});
