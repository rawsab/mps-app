import { describe, expect, it } from 'vitest';
import { ProgramDraft, validateForPublish } from '@/domain/programs/contract';

const draft = (): ProgramDraft => ({
  schemaVersion: 1,
  service: 'mesocycle',
  title: 'Hypertrophy block',
  sharedSections: [],
  resources: [],
  coachNotes: '',
  weeks: [
    {
      id: 'w1',
      index: 1,
      label: 'Week 1',
      startDate: null,
      days: [
        {
          id: 'w1d1',
          label: 'Day 1 Legs',
          scheduledDate: null,
          sections: [
            {
              id: 's1',
              kind: 'main',
              title: '',
              instructions: '',
              exercises: [
                {
                  id: 'e1',
                  logicalKey: 'smith-machine-squat',
                  name: 'Smith Machine Squat',
                  alternatives: [],
                  groupId: null,
                  demoUrl: null,
                  notes: '',
                  prescription: {
                    setCount: { min: 3, max: 3 },
                    targets: [
                      {
                        effort: { kind: 'reps', reps: { min: 8, max: 12 }, perSide: false },
                        load: { mode: 'external', value: { min: 250, max: 250 }, unit: 'lb' },
                        rir: { min: 1, max: 2 },
                        rpe: null,
                        annotations: [],
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    },
  ],
});

describe('ProgramDraft contract', () => {
  it('accepts a complete program and keeps RIR as a range', () => {
    const parsed = ProgramDraft.parse(draft());
    expect(parsed.weeks[0]!.days[0]!.sections[0]!.exercises[0]!.prescription.targets[0]!.rir).toEqual({ min: 1, max: 2 });
    expect(validateForPublish(parsed)).toEqual([]);
  });

  it('rejects a date string where a range belongs', () => {
    const bad = draft() as unknown as { weeks: { days: { sections: { exercises: { prescription: { targets: { rir: unknown }[] } }[] }[] }[] }[] };
    bad.weeks[0]!.days[0]!.sections[0]!.exercises[0]!.prescription.targets[0]!.rir = '2026-01-02';
    expect(ProgramDraft.safeParse(bad).success).toBe(false);
  });

  it('allows incomplete drafts but blocks publishing them', () => {
    const d = draft();
    d.weeks[0]!.days[0]!.sections[0]!.exercises[0]!.prescription.setCount = null;
    expect(ProgramDraft.safeParse(d).success).toBe(true);
    expect(validateForPublish(d)).toEqual([expect.objectContaining({ message: 'Smith Machine Squat: set count is missing' })]);
  });

  it('requires per-set targets to match the set count', () => {
    const d = draft();
    const target = d.weeks[0]!.days[0]!.sections[0]!.exercises[0]!.prescription.targets[0]!;
    d.weeks[0]!.days[0]!.sections[0]!.exercises[0]!.prescription.targets = [target, target];
    expect(ProgramDraft.safeParse(d).success).toBe(false);
  });

  it('does not let nutrition be forced into a workout program', () => {
    expect(validateForPublish({ ...draft(), service: 'nutrition' })).toContainEqual(expect.objectContaining({ path: 'service' }));
  });
});
