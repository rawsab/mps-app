import { describe, expect, it } from 'vitest';
import { canCommit, summarize, type NormalizedImport } from '@/domain/imports/contract';
import { importFile } from '@/domain/imports/importFile';
import { buildXlsx, mesocycleDay, type XCell } from './fixtures/build';

const RIR_AS_DATE: XCell = { n: 46024, style: 'date' }; // "1-2" after spreadsheet date conversion

function baseRows() {
  return [
    { name: 'Leg Press', rir: 2, sets: [[450, 12], [450, 11]] as [string | number, string | number][], tempo: '3-1-1' },
    { name: 'Hack Squat', rir: RIR_AS_DATE, sets: [['BW', 13], ['90 ds', 8.5]] as [string | number, string | number][] },
    { name: 'Leg Curl', rir: '1-2', sets: [["Didn't do", '']] as [string | number, string | number][] },
  ];
}

const exercisesOf = (r: NormalizedImport) => r.program!.weeks.flatMap((w) => w.days.flatMap((d) => d.sections.flatMap((s) => s.exercises)));
const issueCodes = (r: NormalizedImport) => r.issues.map((i) => i.code);

describe('mesocycle profile (synthetic fixtures)', () => {
  it('recognizes the base layout and separates prescriptions from logged results', async () => {
    const cells = { B2: 'NAME:  Synthetic', B3: 'PROGRAM STYLE:  Test Block', B5: 'Week 1', ...mesocycleDay({ originRow: 7, title: 'Day 1 Legs', rows: baseRows() }) };
    const r = await importFile(buildXlsx([{ name: 'Week 1', cells }]), 'base.xlsx');

    expect(r.profile.id).toBe('mps-mesocycle');
    expect(r.program!.title).toBe('Test Block');
    const [legPress, hack, curl] = exercisesOf(r);
    expect(legPress!.prescription.targets[0]!.rir).toEqual({ min: 2, max: 2 });
    expect(curl!.prescription.targets[0]!.rir).toEqual({ min: 1, max: 2 });
    // Date-converted RIR is never silently fixed; it waits for review with a proposal.
    expect(hack!.prescription.targets[0]!.rir).toBeNull();
    const rirIssue = r.issues.find((i) => i.code === 'RIR_DATE_CONVERTED')!;
    expect(rirIssue.proposal).toBe('RIR range 1-2');
    expect(r.sourceItems.find((i) => i.id === 'Week 1!C10')!.displayText).toBe('1-2');

    // Logged weights/reps are history, not future targets (FR-15).
    expect(legPress!.prescription.targets[0]!.load).toBeNull();
    expect(legPress!.prescription.setCount).toBeNull();
    const session = r.history.sessions[0]!;
    expect(session.activityDate).toBeNull();
    expect(session.startedAtLocalTime).toBe('18:00');
    const hackSets = session.exercises.find((e) => e.exerciseName === 'Hack Squat')!.sets;
    expect(hackSets[0]!.load).toEqual({ mode: 'bodyweight', added: null });
    expect(hackSets[1]).toMatchObject({ annotations: ['ds'], effort: { kind: 'reps', reps: { min: 8.5, max: 8.5 } } });
    expect(session.exercises.find((e) => e.exerciseName === 'Leg Curl')!.sets[0]!.status).toBe('skipped');

    expect(issueCodes(r)).toEqual(expect.arrayContaining(['RIR_DATE_CONVERTED', 'LOAD_ANNOTATION', 'LOAD_UNIT_UNKNOWN', 'HISTORY_DATE_REQUIRED']));
    expect(canCommit(r)).toBe(false);
  });

  it('tolerates an inserted column, blank rows and a moved block, and flags the unknown column', async () => {
    const cells = {
      C4: 'Week 1',
      ...mesocycleDay({ originRow: 9, originCol: 'C', title: 'Day 1 Legs', rows: baseRows(), insertTempo: true, blankRowsAfterHeader: 2 }),
      ...mesocycleDay({ originRow: 30, originCol: 'C', title: 'Day 2 Pull', rows: [{ name: 'Cable Row', rir: '2-3', sets: [[180, 12]] }] }),
    };
    const r = await importFile(buildXlsx([{ name: 'Week 1', cells }]), 'shifted.xlsx');
    const s = summarize(r);
    expect(s.days).toBe(2);
    expect(exercisesOf(r).map((e) => e.name)).toEqual(['Leg Press', 'Hack Squat', 'Leg Curl', 'Cable Row']);
    expect(exercisesOf(r)[3]!.prescription.targets[0]!.rir).toEqual({ min: 2, max: 3 });

    const tempo = r.issues.find((i) => i.message.includes('"Tempo"'))!;
    expect(tempo.severity).toBe('blocking');
    expect(tempo.sourceItemIds).toContain('Week 1!D10');
    expect(r.sourceItems.find((i) => i.raw.value === '3-1-1')!.disposition.status).toBe('unresolved');
  });

  it('accounts for every non-empty cell and treats unknown content as unresolved', async () => {
    const cells = { B5: 'Week 1', ...mesocycleDay({ originRow: 7, title: 'Day 1', rows: baseRows() }), H40: 'Mystery note' };
    const r = await importFile(buildXlsx([{ name: 'Week 1', cells }]), 'extra.xlsx');
    const ids = new Set(r.sourceItems.map((i) => i.id));
    const nonEmpty = Object.entries(cells).filter(([, v]) => v !== '');
    expect(nonEmpty.length).toBeGreaterThan(15);
    for (const [ref] of nonEmpty) expect(ids.has(`Week 1!${ref}`), ref).toBe(true);
    expect(r.sourceItems.find((i) => i.id === 'Week 1!H40')!.disposition.status).toBe('unresolved');
    expect(r.sourceItems.every((i) => ['mapped', 'excluded', 'unresolved'].includes(i.disposition.status))).toBe(true);
  });

  it('marks "A or" rows as an alternative needing a decision', async () => {
    const rows = [
      { name: 'Leg Press or', rir: 2, sets: [[450, 12]] as [string | number, string | number][] },
      { name: 'Smith Squat', rir: 2, sets: [[250, 10]] as [string | number, string | number][] },
    ];
    const r = await importFile(buildXlsx([{ name: 'W', cells: mesocycleDay({ originRow: 3, title: 'Day 1', rows }) }]), 'alt.xlsx');
    const [a, b] = exercisesOf(r);
    expect(a!.name).toBe('Leg Press');
    expect(a!.groupId).not.toBeNull();
    expect(a!.groupId).toBe(b!.groupId);
    expect(r.issues.find((i) => i.code === 'EXERCISE_ALTERNATIVE')!.severity).toBe('blocking');
  });

  it('is deterministic for the same input', async () => {
    const bytes = buildXlsx([{ name: 'W', cells: mesocycleDay({ originRow: 3, title: 'Day 1', rows: baseRows() }) }]);
    expect(await importFile(bytes, 'a.xlsx')).toEqual(await importFile(bytes, 'a.xlsx'));
  });

  it('decodes the 1904 date system', async () => {
    const rows = [{ name: 'Leg Press', rir: { n: 44562, style: 'date' } as XCell, sets: [[1, 1]] as [string | number, string | number][] }];
    const r = await importFile(buildXlsx([{ name: 'W', cells: mesocycleDay({ originRow: 3, title: 'Day 1', rows }) }], { date1904: true }), 'mac.xlsx');
    expect(r.issues.find((i) => i.code === 'RIR_DATE_CONVERTED')!.proposal).toBe('RIR range 1-2');
  });
});
