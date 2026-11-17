import { convertWeight, shiftDate } from './nutrition';
import type { NutritionWeek } from './nutritionProgram';

export const NUTRITION_TREND_METRICS = { weight: 'Weight', intake: 'Calories consumed', output: 'Caloric output', balance: 'Daily caloric balance' } as const;
export type NutritionTrendMetric = keyof typeof NUTRITION_TREND_METRICS;
export type NutritionTrendPoint = { date: string; value: number };

/** Calories use their activity date; weights use their weigh-in date. Missing values are omitted, never replaced with zero. */
export function nutritionTrendPoints(weeks: NutritionWeek[], metric: NutritionTrendMetric, days: 7 | 30, today: string): NutritionTrendPoint[] {
  const from = shiftDate(today, 1 - days);
  return weeks.flatMap((week) => week.rows.flatMap((row) => {
    const date = metric === 'weight' ? row.date : row.activityDate;
    const value = metric === 'weight' ? row.weight?.weight == null ? null : convertWeight(row.weight.weight, row.weight.unit, week.unit)
      : metric === 'balance' ? row.balance : row.entry?.[metric] ?? null;
    return date >= from && date <= today && value !== null && Number.isFinite(value) ? [{ date, value }] : [];
  })).sort((a, b) => a.date.localeCompare(b.date));
}

export function nutritionTrendScale(points: NutritionTrendPoint[], metric: NutritionTrendMetric) {
  const values = points.map((p) => p.value);
  let min = Math.min(0, ...values), max = Math.max(0, ...values);
  if (metric === 'weight' && values.length) {
    min = Math.min(...values); max = Math.max(...values);
    const pad = Math.max((max - min) * 0.15, 1);
    min = Math.max(0, min - pad); max += pad;
  }
  if (min === max) max = min + 1;
  return { min, max };
}
