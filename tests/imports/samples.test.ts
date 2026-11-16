/**
 * Expectations for the supplied, anonymized sample templates (samples/). Each expected value was
 * checked by hand against the raw cell/paragraph dump, not copied from parser output.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { summarize, type NormalizedImport } from '@/domain/imports/contract';
import { importFile } from '@/domain/imports/importFile';

const load = (name: string) => importFile(new Uint8Array(readFileSync(`samples/${name}`)), name);
const byCell = (r: NormalizedImport, id: string) => r.sourceItems.find((i) => i.id === id)!;

describe('Mesocycle Sample', async () => {
  const r = await load('Mesocycle Sample (Google Drive).xlsx');
  const s = summarize(r);

  it('finds one week, six days and 47 exercises', () => {
    expect(r.profile.id).toBe('mps-mesocycle');
    expect(s.weeks).toBe(1);
    expect(r.program!.weeks[0]!.days.map((d) => d.label)).toEqual(['Day 1 Legs', 'Day 2 Pull', 'Day 3 Push', 'Day 4 Legs', 'Day 5 Pull', 'Day 6 Push']);
    expect(s.exercises).toBe(47);
    expect(r.program!.title).toBe('Hypertrophy Mesocycle');
  });

  it('flags exactly the three date-converted RIR cells with a 1-2 proposal', () => {
    const rir = r.issues.filter((i) => i.code === 'RIR_DATE_CONVERTED');
    expect(rir.flatMap((i) => i.sourceItemIds).sort()).toEqual(['Week 1!C15', 'Week 1!C20', 'Week 1!C34']);
    expect(new Set(rir.map((i) => i.proposal))).toEqual(new Set(['RIR range 1-2']));
    expect(byCell(r, 'Week 1!C15').raw).toMatchObject({ value: '46024.0', numberFormat: 'm-d' });
  });

  it('splits drop-set annotations and leaves the unknown "qs" without a proposal', () => {
    const ann = r.issues.filter((i) => i.code === 'LOAD_ANNOTATION');
    expect(ann.map((i) => i.sourceItemIds[0]).sort()).toEqual(
      ['Week 1!J29', 'Week 1!J33', 'Week 1!L33', 'Week 1!L53', 'Week 1!J68', 'Week 1!J84'].sort(),
    );
    expect(ann.find((i) => i.sourceItemIds[0] === 'Week 1!L33')!.proposal).toBeNull();
  });

  it('keeps logged sets as undated history with decimal reps and skipped sets', () => {
    expect(r.history.sessions).toHaveLength(6);
    expect(r.history.sessions.every((x) => x.activityDate === null)).toBe(true);
    const day1 = r.history.sessions[0]!;
    expect([day1.startedAtLocalTime, day1.endedAtLocalTime]).toEqual(['14:45', '16:08']);
    const chinup = r.history.sessions[1]!.exercises.find((e) => e.exerciseName === 'Assisted Chinup')!;
    expect(chinup.sets[2]!.effort).toEqual({ kind: 'reps', reps: { min: 8.5, max: 8.5 }, perSide: false });
    const cableFly = r.history.sessions[2]!.exercises.find((e) => e.exerciseName === 'Cable Chest Fly')!;
    expect(cableFly.sets[0]!.status).toBe('skipped');
    expect(day1.feedback).toContainEqual(expect.objectContaining({ muscle: 'Quads', question: 'challenge', score: 2 }));
  });

  it('flags the three "or" alternatives and the stray AH16 value', () => {
    expect(r.issues.filter((i) => i.code === 'EXERCISE_ALTERNATIVE')).toHaveLength(3);
    expect(byCell(r, 'Week 1!AH16').disposition.status).toBe('unresolved');
  });

  it('excludes ownership notices and legacy summaries with reasons, and maps coach notes and resources', () => {
    expect(byCell(r, 'Week 1!U3').disposition).toMatchObject({ status: 'excluded', decidedBy: 'profile_rule' });
    expect(byCell(r, 'Week 1!E101').role).toBe('calculated');
    expect(byCell(r, 'Week 1!C89').disposition).toMatchObject({ status: 'mapped', targets: ['program.coachNotes'] });
    expect(r.program!.resources[0]!.title).toBe('Additional Resources');
  });

  it('never claims a commit-ready result while blocking issues remain', () => {
    expect(s.unresolved).toBeGreaterThan(0);
    expect(r.profile.status).toBe('needs_review');
  });
});

describe('Nutrition Template Sample', async () => {
  const r = await load('Nutrition Template Sample (Google Drive).xlsx');

  it('reads 28 dated weigh-ins and previous-day intake logs', () => {
    expect(r.history.bodyweights).toHaveLength(28);
    expect(r.history.bodyweights[0]).toMatchObject({ measurementDate: '2026-04-14', value: 200, unit: 'lb' });
    expect(r.history.nutritionLogs[0]).toMatchObject({ activityDate: '2026-04-13', intakeKcal: 3555, outputKcal: 2500 });
    expect(r.history.bodyweights.at(-1)!.measurementDate).toBe('2026-05-11');
  });

  it('proposes targets but requires effective dates, and flags the received-date mismatch', () => {
    expect(r.nutritionTargets[0]).toMatchObject({ maintenanceKcal: 2600, goalKcal: 2800, styleLabel: '4 Week Conservative Bulk' });
    expect(r.issues.find((i) => i.code === 'NUTRITION_TARGET_DATES')!.severity).toBe('blocking');
    expect(r.issues.find((i) => i.code === 'HEADER_DATE_MISMATCH')!.message).toContain('2026-04-14 to 2026-05-11');
  });

  it('leaves no unrecognized content', () => {
    expect(r.issues.some((i) => i.code === 'UNRECOGNIZED_CONTENT')).toBe(false);
  });
});

describe('Personal Training Document Sample', async () => {
  const r = await load('Personal Training Document Sample.docx');

  it('reads preparation circuits and two full-body days in order', () => {
    const p = r.program!;
    expect(p.sharedSections.map((x) => x.title)).toEqual(['Warm-Up', 'Hip Mobility', 'Foam Rolling Circuit']);
    expect(p.sharedSections[1]!.instructions).toContain('Perform hip mobility circuit');
    expect(p.weeks[0]!.days.map((d) => d.label)).toEqual(['Day 1 Full Body', 'Day 2 Full Body']);
    expect(summarize(r).exercises).toBe(18);
  });

  it('flags the 0-set Reverse Nordic, per-set rep lists and "(1)" annotations', () => {
    expect(r.issues.filter((i) => i.code === 'SET_COUNT_CONFLICT')).toHaveLength(1);
    expect(r.issues.filter((i) => i.code === 'PER_SET_TARGETS_AMBIGUOUS')).toHaveLength(4);
    expect(r.issues.filter((i) => i.code === 'LOAD_ANNOTATION').map((i) => i.message)).toEqual([
      expect.stringContaining('35lbs (1)'),
      expect.stringContaining('20lbs (1)'),
    ]);
  });

  it('reads RPE ranges and explicit pound loads', () => {
    const lunges = r.program!.weeks[0]!.days[0]!.sections[0]!.exercises.find((e) => e.name === 'Walking Lunges')!;
    expect(lunges.prescription.targets[0]).toMatchObject({
      rpe: { min: 8.5, max: 9 },
      load: { mode: 'external', value: { min: 25, max: 25 }, unit: 'lb' },
      effort: { kind: 'reps', reps: { min: 15, max: 15 }, perSide: true },
    });
  });
});
