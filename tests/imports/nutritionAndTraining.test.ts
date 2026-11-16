import { describe, expect, it } from 'vitest';
import { importFile } from '@/domain/imports/importFile';
import { buildDocx, buildXlsx, type XCell } from './fixtures/build';

describe('nutrition profile (synthetic)', () => {
  const day = (serial: number): XCell => ({ n: serial, style: 'date' });

  it('separates weigh-in dates from the previous day of intake, using heading synonyms', async () => {
    const cells: Record<string, XCell> = {
      B2: 'DATE RECEIVED:  July 20, 2026',
      B4: 'Weekly Weight Values (kg)',
      P5: 'Starting Predicted Maintenance Calories:',
      T5: 2400,
      C7: 'Date', E7: 'Weight', I7: 'Calories Day B4', K7: 'Caloric Output Day B4', M7: 'Daily Caloric Balance',
      B8: 'Week 1', C8: day(46126), E8: 90.2, I8: 2500, K8: 2300, M8: { f: '(I8-K8)', v: 200 },
      C9: day(46127), E9: 90.4, I9: 2600, M9: { f: '(I9-K9)', v: 0 },
      // An extra blank row inside the block and a missing weight
      C11: day(46129), I11: 2400, K11: 2350,
    };
    const r = await importFile(buildXlsx([{ name: 'Log', cells }]), 'nutrition.xlsx');
    expect(r.profile.id).toBe('mps-nutrition');
    expect(r.history.bodyweights).toEqual([
      expect.objectContaining({ measurementDate: '2026-04-14', value: 90.2, unit: 'kg' }),
      expect.objectContaining({ measurementDate: '2026-04-15', value: 90.4, unit: 'kg' }),
    ]);
    expect(r.history.nutritionLogs[0]).toMatchObject({ activityDate: '2026-04-13', intakeKcal: 2500, outputKcal: 2300 });
    // A missing output stays null, never zero.
    expect(r.history.nutritionLogs[1]).toMatchObject({ activityDate: '2026-04-14', intakeKcal: 2600, outputKcal: null });
    expect(r.nutritionTargets[0]).toMatchObject({ maintenanceKcal: 2400, effectiveFrom: null });
    expect(r.issues.map((i) => i.code)).toEqual(expect.arrayContaining(['NUTRITION_TARGET_DATES', 'HEADER_DATE_MISMATCH']));
    expect(r.sourceItems.find((i) => i.id === 'Log!B2')!.disposition).toMatchObject({ status: 'excluded' });
  });

  it('requires a unit decision when no unit evidence exists', async () => {
    const cells: Record<string, XCell> = { C1: 'Date', E1: 'Weight', I1: 'Calories Consumed Day Before', C2: day(46126), E2: 200, I2: 3000 };
    const r = await importFile(buildXlsx([{ name: 'Log', cells }]), 'n.xlsx');
    expect(r.history.bodyweights[0]!.unit).toBeNull();
    expect(r.issues.find((i) => i.code === 'LOAD_UNIT_UNKNOWN')!.severity).toBe('blocking');
  });
});

describe('personal training profile (synthetic)', () => {
  it('reads preparation circuits, day tables, notes and target notation', async () => {
    const bytes = buildDocx(
      [
        { table: [['Warm-Up', ''], ['Arm Circles', '30 seconds x2'], ['Hip Mobility', ''], ['Clamshell', 'Sets: 1-2    Reps: 15 each leg      Weight: Red']] },
        { p: 'Note: Do this before every session.' },
        {
          table: [
            ['Day 1 Full Body', 'Sets', 'Reps', 'Weight', 'RPE'],
            ['Goblet Squat', '3', '12', '40lbs', '8'],
            ['Plank', '2-3', '60 secs', '--', '--'],
            ['Split Squat', '2', '15 each leg', '25', '8.5-9'],
            ['Row', '2', '14, 12', '35lbs (1)', '8'],
          ],
        },
        { p: 'Note:' },
      ],
      'Name: Synthetic\tDate: November 7, 2026',
    );
    const r = await importFile(bytes, 'pt.docx');
    expect(r.profile.id).toBe('mps-personal-training');
    const p = r.program!;
    expect(p.sharedSections.map((s) => [s.title, s.kind])).toEqual([
      ['Warm-Up', 'preparation'],
      ['Hip Mobility', 'preparation'],
    ]);
    expect(p.sharedSections[0]!.exercises[0]!.prescription).toMatchObject({
      setCount: { min: 2, max: 2 },
      targets: [{ effort: { kind: 'duration', seconds: { min: 30, max: 30 } } }],
    });
    expect(p.sharedSections[1]!.exercises[0]!.prescription).toMatchObject({
      setCount: { min: 1, max: 2 },
      targets: [{ effort: { kind: 'reps', perSide: true }, load: { mode: 'band', label: 'Red' } }],
    });
    expect(p.sharedSections[1]!.instructions).toBe('Do this before every session.');

    const [squat, plank, split, row] = p.weeks[0]!.days[0]!.sections[0]!.exercises;
    expect(p.weeks[0]!.days[0]!.label).toBe('Day 1 Full Body');
    expect(squat!.prescription.targets[0]!.load).toEqual({ mode: 'external', value: { min: 40, max: 40 }, unit: 'lb' });
    expect(plank!.prescription.setCount).toEqual({ min: 2, max: 3 });
    expect(plank!.prescription.targets[0]!.load).toEqual({ mode: 'not_applicable' });
    expect(split!.prescription.targets[0]!.rpe).toEqual({ min: 8.5, max: 9 });
    expect(row!.prescription.targets[0]!.effort).toBeNull();

    const codes = r.issues.map((i) => `${i.severity}:${i.code}`);
    expect(codes).toEqual(expect.arrayContaining(['blocking:PER_SET_TARGETS_AMBIGUOUS', 'blocking:LOAD_ANNOTATION', 'blocking:LOAD_UNIT_UNKNOWN', 'info:BAND_LOAD']));
    // Header identity/date is evidence only, never an activity date.
    expect(r.sourceItems.find((i) => i.location.kind === 'docx_header_footer')!.disposition.status).toBe('excluded');
    expect(r.sourceItems.find((i) => i.raw.value === 'Note:')!.disposition).toMatchObject({ status: 'excluded' });
  });

  it('leaves unknown documents unsupported rather than producing an empty program', async () => {
    const r = await importFile(buildDocx([{ p: 'Dear client, welcome!' }]), 'letter.docx');
    expect(r.profile.status).toBe('unsupported');
    expect(r.program).toBeNull();
  });
});
