import { describe, expect, it } from 'vitest';
import { convertWeight, shiftDate, type NutritionEntry, type WeighIn } from '@/domain/nutrition';
import { NutritionProgramDraft as DraftSchema, NutritionDailyInput, nutritionHasUnpublishedChanges, nutritionPublishProblems, nutritionTotals, nutritionWeeks, planNutritionCells, startingPrediction, type NutritionProgramDraft } from '@/domain/nutritionProgram';

const draft: NutritionProgramDraft = { program_style: '4 Week Conservative Bulk', start_date: '2026-01-05', weight_unit: 'lb', week_count: 4, maintenance: 2600, calorie_goal: 2800, notes: '' };
const attribution = { version: 1, updated_at: '2026-01-05T12:00:00Z', updated_by_staff: false };
function weights(values: number[], start = draft.start_date!): WeighIn[] {
  return values.map((weight, i) => ({ ...attribution, measured_on: shiftDate(start, i), weight, unit: 'lb' }));
}
function entries(intakes: (number | null)[], outputs: (number | null)[]): NutritionEntry[] {
  return intakes.map((intake, i) => ({ ...attribution, activity_on: shiftDate(draft.start_date!, i - 1), intake, output: outputs[i] ?? null, notes: 'Retain daily note' }));
}

describe('nutritional program calculations (FR-09/10, owner-approved definitions)', () => {
  it('independently reconciles sample calories and the approved weekly-average weight change', () => {
    const w = weights([200,201,204,201,200,203,201,201,204,203,203,201,202,203,204,205,204,205,205,201,202,203,203,204,205,206,206,205]);
    const intake = [3555,3001,2800,2700,3004,3001,2888,3225,3100,3200,2450,2750,2945,3013,2780,2900,3150,3020,2888,2656,3215,2888,3240,3023,3300,3100,3126,3027];
    const output = [2500,2501,2300,2503,2333,2423,2700,...Array.from({length:21},(_,i) => 2507+i)];
    const weeks = nutritionWeeks(draft, w, entries(intake, output), '2026-02-10');
    expect(weeks.map((week) => week.weeklyBalance)).toEqual([3689,3113,2990,4036]);
    expect(weeks[0]!.averageBalance).toBe(527);
    expect(weeks[0]!.averageOutput).toBeCloseTo(2465.7142857);
    expect(weeks[0]!.change).toBeCloseTo(1.4285714); // Week 1 average minus first weight.
    expect(weeks[1]!.change).toBeCloseTo(1); // Current weekly average minus previous weekly average.
    const total = nutritionTotals(weeks);
    expect(total.predictedChange).toBeCloseTo(3.950857143);
    expect(total.actualChange).toBeCloseTo(4.571428571);
    expect(total.averageChange).toBeCloseTo(1.142857143);
    expect(startingPrediction(draft)).toBe(0.4);
  });
  it('creates four seven-day weeks from Start Date, independent of weekday', () => {
    const weeks = nutritionWeeks({ ...draft, start_date: '2026-03-07' }, [], [], '2026-03-07');
    expect(weeks[0]!.from).toBe('2026-03-07'); expect(weeks[0]!.through).toBe('2026-03-13');
    expect(weeks[1]!.from).toBe('2026-03-14'); expect(weeks.at(-1)!.through).toBe('2026-04-03');
    expect(weeks[0]!.rows[0]!.activityDate).toBe('2026-03-06');
  });
  it('shows rolling averages only after three real weigh-ins and excludes missing or future rows', () => {
    const weeks = nutritionWeeks(draft, weights([200,201,202,999]), [], '2026-01-07');
    expect(weeks[0]!.rows[1]!.rolling.average).toBeNull();
    expect(weeks[0]!.rows[2]!.rolling.average).toBe(201);
    expect(weeks[0]!.rows[3]!.rolling.average).toBeNull();
    expect(weeks[0]!.average).toEqual({count:3, average:201});
    expect(weeks[0]!.change).toBe(1);
  });
  it('excludes insufficient weeks from the mesocycle average denominator', () => {
    const w = [...weights([200,200,200]), ...weights([202,202], '2026-01-12')];
    const total = nutritionTotals(nutritionWeeks(draft,w,[],'2026-02-10'));
    expect(total).toMatchObject({actualChange:0,averageChange:0,measuredWeeks:1,predictedChange:null});
  });
  it('leaves a later weekly change unavailable when the preceding week lacks sufficient weigh-ins', () => {
    const weeks = nutritionWeeks(draft,weights([202,203,204],'2026-01-12'),[],'2026-02-10');
    expect(weeks[1]!.average.average).toBe(203); expect(weeks[1]!.change).toBeNull();
    expect(nutritionTotals(weeks).actualChange).toBeNull();
  });
  it('distinguishes zero intake from a missing calorie pair in partial weeks', () => {
    const weeks = nutritionWeeks(draft,[],entries([0,2000,null],[2000,null,2500]),'2026-02-10');
    expect(weeks[0]).toMatchObject({weeklyBalance:-2000,averageBalance:-2000,pairCount:1,outputCount:2,averageOutput:2250});
  });
  it('requires coach baseline fields for publication and preserves valid zero calories', () => {
    expect(nutritionPublishProblems({...draft,program_style:'',start_date:null,maintenance:null,calorie_goal:null})).toHaveLength(4);
    expect(nutritionPublishProblems({...draft,maintenance:0,calorie_goal:0})).toEqual([]);
    expect(startingPrediction({...draft,maintenance:null})).toBeNull();
  });
});

describe('nutrition spreadsheet edit planning', () => {
  it('requires all three daily values without treating blank or missing calories as zero', () => {
    expect(NutritionDailyInput.safeParse({weight:200,intake:0,output:0}).success).toBe(true);
    expect(NutritionDailyInput.safeParse({weight:200,intake:2200,output:null}).success).toBe(false);
    expect(NutritionDailyInput.safeParse({weight:200,intake:'',output:2500}).success).toBe(false);
    expect(NutritionDailyInput.safeParse({weight:0,intake:2200,output:2500}).success).toBe(false);
  });
  const weeks = nutritionWeeks(draft, weights([200]), entries([2200],[2400]), '2026-02-10');
  it('merges calorie cells into one versioned activity entry, keeping notes and a separate weight write', () => {
    expect(planNutritionCells(weeks,[{date:'2026-01-05',column:'intake',text:'0'},{date:'2026-01-05',column:'output',text:''},{date:'2026-01-05',column:'weight',text:'201'}],'2026-02-10')).toEqual([
      {row_date:'2026-01-05',kind:'nutrition',expected_version:1,value:{intake:0,output:null,notes:'Retain daily note'}},
      {row_date:'2026-01-05',kind:'weight',expected_version:1,value:{weight:201,unit:'lb'}},
    ]);
  });
  it('refuses an entire paste plan for invalid calories or future dates', () => {
    expect(() => planNutritionCells(weeks,[{date:'2026-01-05',column:'intake',text:'2000'},{date:'2026-01-06',column:'output',text:'-1'}],'2026-02-10')).toThrow('whole numbers');
    expect(() => planNutritionCells(weeks,[{date:'2026-01-06',column:'weight',text:'200'}],'2026-01-05')).toThrow('up to today');
  });
});


describe('program weight units', () => {
  it('defaults older programs to lb and rejects unknown units', () => {
    const {weight_unit: _unit, ...legacy} = draft;
    expect(DraftSchema.parse(legacy).weight_unit).toBe('lb');
    expect(DraftSchema.safeParse({...draft,weight_unit:'oz'}).success).toBe(false);
  });
  it('converts mixed-unit measurements, averages, baseline and predicted changes to kg without mutating logs', () => {
    const logs = weights([200,202,204]);
    logs[1] = {...logs[1]!,weight:convertWeight(202,'lb','kg'),unit:'kg'};
    const before = structuredClone(logs);
    const week = nutritionWeeks({...draft,weight_unit:'kg'},logs,entries([3500],[0]),'2026-01-07')[0]!;
    expect(week.average.average).toBeCloseTo(91.62565874);
    expect(week.rows[2]!.rolling.average).toBeCloseTo(91.62565874);
    expect(week.change).toBeCloseTo(0.90718474);
    expect(week.predictedChange).toBeCloseTo(0.45359237);
    expect(nutritionTotals([week]).actualChange).toBeCloseTo(0.90718474);
    expect(startingPrediction({...draft,weight_unit:'kg'})).toBeCloseTo(0.181436948);
    expect(logs).toEqual(before);
    expect(planNutritionCells([week],[{date:'2026-01-05',column:'weight',text:'92'}],'2026-01-07')[0]).toMatchObject({value:{weight:92,unit:'kg'},expected_version:1});
  });
});


it('enables publishing only for a new program or details different from the live program', () => {
  expect(nutritionHasUnpublishedChanges(draft,null)).toBe(true);
  expect(nutritionHasUnpublishedChanges({...draft},draft)).toBe(false);
  expect(nutritionHasUnpublishedChanges({...draft,weight_unit:'kg'},draft)).toBe(true);
  expect(nutritionHasUnpublishedChanges({...draft,notes:'Updated'},draft)).toBe(true);
  const changed = {...draft,notes:'Updated'};
  expect(nutritionHasUnpublishedChanges({...changed,notes:draft.notes},draft)).toBe(false);
});
