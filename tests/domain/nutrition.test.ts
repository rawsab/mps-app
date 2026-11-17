import { describe, expect, it } from 'vitest';
import { calorieBalance, convertWeight, monday, NutritionTargetInput, optionalNumber, shiftDate, targetOn, weightAverage, type NutritionTarget, type WeighIn } from '@/domain/nutrition';

const target = (starts_on: string, goal: number, ends_on: string | null = null): NutritionTarget => ({
  id: starts_on, created_at: '2026-11-17T00:00:00Z', starts_on, ends_on, style: 'Maintenance', calorie_goal: goal,
  maintenance: null, baseline_weight: null, weight_unit: 'lb', notes: '',
});
const weight = (date: string, value: number, unit: 'kg' | 'lb' = 'lb'): WeighIn => ({ measured_on: date, weight: value, unit, version: 1, updated_at: '', updated_by_staff: false });

describe('nutrition calendar and target history (FR-09)', () => {
  it('keeps Sunday calories separate from Monday weight across DST and year boundaries', () => {
    expect(shiftDate('2026-11-02', -1)).toBe('2026-11-01');
    expect(monday('2026-11-01')).toBe('2026-10-26');
    expect(monday('2026-11-02')).toBe('2026-11-02');
    expect(shiftDate('2027-01-01', -1)).toBe('2026-12-31');
    expect(shiftDate('2028-03-01', -1)).toBe('2028-02-29');
  });
  it('uses the target in effect on the activity date, preserving earlier goals', () => {
    const targets = [target('2026-11-17', 2400), target('2026-11-01', 2200)];
    expect(targetOn(targets, '2026-11-16')?.calorie_goal).toBe(2200);
    expect(targetOn(targets, '2026-11-17')?.calorie_goal).toBe(2400);
    expect(targetOn(targets, '2026-10-31')).toBeUndefined();
  });
  it('never revives a superseded target after the newer one ends', () => {
    expect(targetOn([target('2026-11-01', 2000), target('2026-11-10', 2400, '2026-11-16')], '2026-11-17')).toBeUndefined();
  });
  it('validates dates, optional baseline and whole calories', () => {
    expect(NutritionTargetInput.safeParse(target('2026-11-17', 0)).success).toBe(true);
    expect(NutritionTargetInput.safeParse(target('2026-11-17', 2200.5)).success).toBe(false);
    expect(NutritionTargetInput.safeParse(target('2026-11-17', 2200, '2026-11-16')).success).toBe(false);
    expect(NutritionTargetInput.safeParse({ ...target('2026-11-17', 2200), baseline_weight: 0 }).success).toBe(false);
  });
});
describe('nutrition summaries (FR-10)', () => {
  it('preserves missing versus actual zero intake/output', () => {
    expect(optionalNumber('')).toBeNull(); expect(optionalNumber('0')).toBe(0);
    expect(calorieBalance({ intake: 0, output: 2100 })).toBe(-2100);
    expect(calorieBalance({ intake: 2100, output: null })).toBeNull();
  });
  it('requires three actual dates and does not include missing or out-of-window measurements', () => {
    const rows = [weight('2026-11-10', 100), weight('2026-11-15', 150), weight('2026-11-16', 152), weight('2026-11-17', 154)];
    expect(weightAverage(rows, '2026-11-15', '2026-11-16', 'lb')).toEqual({ count: 2, average: null });
    expect(weightAverage(rows, '2026-11-11', '2026-11-17', 'lb')).toEqual({ count: 3, average: 152 });
  });
  it('converts explicit units before averaging', () => {
    expect(convertWeight(1, 'lb', 'kg')).toBeCloseTo(0.45359237, 8);
    expect(convertWeight(1, 'kg', 'lb')).toBeCloseTo(2.20462262, 8);
    const average = weightAverage([weight('2026-11-15', 100, 'kg'), weight('2026-11-16', 220.462262), weight('2026-11-17', 100, 'kg')], '2026-11-11', '2026-11-17', 'kg');
    expect(average.average).toBeCloseTo(100, 6);
  });
});
