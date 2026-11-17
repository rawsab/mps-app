import { describe, expect, it } from 'vitest';
import { nutritionWeeks, type NutritionProgramDraft } from '@/domain/nutritionProgram';
import { nutritionTrendPoints, nutritionTrendScale } from '@/domain/nutritionTrends';
import { shiftDate } from '@/domain/nutrition';

const draft: NutritionProgramDraft = { program_style: 'Trends', start_date: '2026-06-01', week_count: 6, weight_unit: 'kg', maintenance: 2500, calorie_goal: 2000, notes: '' };
const attribution = { version: 1, updated_at: '', updated_by_staff: false };
const weights = Array.from({length: 35}, (_, day) => ({...attribution, measured_on: shiftDate('2026-06-01', day), weight: day === 34 ? null : 200, unit: 'lb' as const}));
const entries = [
  {...attribution,activity_on:'2026-06-28',intake:0,output:2000,notes:''},
  {...attribution,activity_on:'2026-06-29',intake:2500,output:null,notes:''},
  {...attribution,activity_on:'2026-06-30',intake:2000,output:2000,notes:''},
];
const weeks = nutritionWeeks(draft, weights, entries, '2026-07-05');

describe('nutrition trend data', () => {
  it('uses inclusive calendar ranges ending today and excludes missing weights', () => {
    const seven = nutritionTrendPoints(weeks,'weight',7,'2026-07-05');
    expect(seven).toHaveLength(6);
    expect(seven[0]!.date).toBe('2026-06-29');
    expect(seven.at(-1)!.date).toBe('2026-07-04');
    expect(seven[0]!.value).toBeCloseTo(90.718474);
    const thirty = nutritionTrendPoints(weeks,'weight',30,'2026-07-05');
    expect(thirty).toHaveLength(29);
    expect(thirty[0]!.date).toBe('2026-06-06');
  });
  it('uses calorie activity dates, preserves zero and skips unknown calorie pairs', () => {
    expect(nutritionTrendPoints(weeks,'intake',7,'2026-07-04')).toEqual([
      {date:'2026-06-28',value:0}, {date:'2026-06-29',value:2500}, {date:'2026-06-30',value:2000},
    ]);
    expect(nutritionTrendPoints(weeks,'output',7,'2026-07-04')).toEqual([{date:'2026-06-28',value:2000},{date:'2026-06-30',value:2000}]);
    expect(nutritionTrendPoints(weeks,'balance',7,'2026-07-04')).toEqual([{date:'2026-06-28',value:-2000},{date:'2026-06-30',value:0}]);
  });
  it('keeps empty, single-point, constant and negative-only scales finite', () => {
    expect(nutritionTrendScale([],'weight')).toEqual({min:0,max:1});
    expect(nutritionTrendScale([{date:'2026-06-01',value:100}],'weight')).toEqual({min:99,max:101});
    expect(nutritionTrendScale([{date:'2026-06-01',value:-500}],'balance')).toEqual({min:-500,max:0});
    expect(nutritionTrendPoints([],'weight',7,'2026-07-05')).toEqual([]);
  });
});
