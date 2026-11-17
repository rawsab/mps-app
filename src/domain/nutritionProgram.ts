import { z } from 'zod';
import { calorieBalance, convertWeight, NutritionData, NutritionEntry, shiftDate, WeighIn, weightAverage } from './nutrition';

export const NutritionDailyInput = z.object({
  weight: z.number().positive('Enter your weight.').max(1500,'Weight must be at most 1,500 in the selected unit.'),
  intake: z.number().int('Enter whole calories.').min(0).max(30000),
  output: z.number().int('Enter whole calories.').min(0).max(30000),
});

export const NutritionProgramDraft = z.object({
  program_style: z.string().max(160),
  start_date: z.iso.date().nullable(),
  weight_unit: z.enum(['lb', 'kg']).default('lb'),
  week_count: z.number().int().min(1).max(52),
  maintenance: z.number().int().min(0).max(30000).nullable(),
  calorie_goal: z.number().int().min(0).max(30000).nullable(),
  notes: z.string().max(5000),
});
export type NutritionProgramDraft = z.infer<typeof NutritionProgramDraft>;
export const NutritionRevision = NutritionProgramDraft.extend({
  id: z.string(), revision_number: z.number().int(), lock_version: z.number().int(),
  status: z.enum(['draft', 'published']), updated_at: z.string(), published_at: z.string().nullable(),
});
export type NutritionRevision = z.infer<typeof NutritionRevision>;
export const NutritionProgramSnapshot = z.object({
  id: z.string(), client_id: z.string(), client_name: z.string(), today: z.iso.date(),
  archived_at: z.string().nullable(), current_revision_id: z.string().nullable(),
  can_edit: z.boolean(), can_publish: z.boolean(), can_log: z.boolean(),
  revision: NutritionRevision,
  overlaps: z.array(z.object({ id: z.string(), program_style: z.string(), start_date: z.iso.date(), end_date: z.iso.date() })),
  weights: z.array(WeighIn), entries: z.array(NutritionEntry),
  changes: NutritionData.shape.changes,
});
export type NutritionProgramSnapshot = z.infer<typeof NutritionProgramSnapshot>;
export const NutritionProgramSummary = z.object({
  id: z.string(), program_style: z.string(), start_date: z.iso.date(), week_count: z.number().int(),
  archived_at: z.string().nullable(), published_at: z.string(),
  /** The service's current program (decision 0039); older responses omit it. */
  is_current: z.boolean().default(false),
});
export type NutritionProgramSummary = z.infer<typeof NutritionProgramSummary>;

export function nutritionPublishProblems(draft: NutritionProgramDraft): string[] {
  return [!draft.program_style.trim() ? 'Enter a Program Style.' : '', !draft.start_date ? 'Choose a Start Date.' : '',
    draft.maintenance === null ? 'Enter Starting Predicted Maintenance Calories.' : '',
    draft.calorie_goal === null ? 'Enter Starting Predicted Daily Caloric Goal.' : ''].filter(Boolean);
}
export function startingPrediction(draft: NutritionProgramDraft): number | null {
  return draft.maintenance === null || draft.calorie_goal === null ? null : convertWeight((draft.calorie_goal - draft.maintenance) * 7 / 3500, 'lb', draft.weight_unit ?? 'lb');
}
export function draftFromRevision(revision: NutritionRevision): NutritionProgramDraft {
  return NutritionProgramDraft.parse(revision);
}
export function nutritionHasUnpublishedChanges(draft: NutritionProgramDraft, published: NutritionProgramDraft | null): boolean {
  return published === null || JSON.stringify(NutritionProgramDraft.parse(draft)) !== JSON.stringify(NutritionProgramDraft.parse(published));
}
export function nutritionWeeks(draft: NutritionProgramDraft, weights: WeighIn[], entries: NutritionEntry[], today: string) {
  if (!draft.start_date) return [];
  const start = draft.start_date;
  const unit = draft.weight_unit ?? 'lb';
  return Array.from({ length: draft.week_count }, (_, index) => {
    const from = shiftDate(start, index * 7), through = shiftDate(from, 6);
    const rows = Array.from({ length: 7 }, (_, day) => {
      const date = shiftDate(from, day), activityDate = shiftDate(date, -1);
      const weight = weights.find((w) => w.measured_on === date);
      const entry = entries.find((n) => n.activity_on === activityDate);
      const rolling = date <= today ? weightAverage(weights, shiftDate(date, -6), date, unit) : { count: 0, average: null };
      return { date, activityDate, weight, entry, rolling, balance: entry && date <= today ? calorieBalance(entry) : null };
    });
    const average = weightAverage(weights, from, through < today ? through : today, unit);
    const previous = weightAverage(weights, shiftDate(from, -7), shiftDate(from, -1), unit);
    const first = weights.filter((w) => w.weight !== null && w.measured_on >= start && w.measured_on <= through && w.measured_on <= today).sort((a, b) => a.measured_on.localeCompare(b.measured_on))[0];
    const baseline = index === 0 ? first ? convertWeight(first.weight!, first.unit, unit) : null : previous.average;
    const change = average.average === null || baseline === null ? null : average.average - baseline;
    const pairs = rows.filter((r) => r.date <= today && r.balance !== null);
    const outputs = rows.filter((r) => r.date <= today && r.entry?.output != null);
    const weeklyBalance = pairs.length ? pairs.reduce((sum, r) => sum + r.balance!, 0) : null;
    return { index, from, through, rows, average, change, unit, pairCount: pairs.length, outputCount: outputs.length,
      weeklyBalance, averageBalance: weeklyBalance === null ? null : weeklyBalance / pairs.length,
      averageOutput: outputs.length ? outputs.reduce((sum, r) => sum + r.entry!.output!, 0) / outputs.length : null,
      predictedChange: weeklyBalance === null ? null : convertWeight(weeklyBalance / 3500, 'lb', unit) };
  });
}
export type NutritionWeek = ReturnType<typeof nutritionWeeks>[number];
export function nutritionTotals(weeks: NutritionWeek[]) {
  const predicted = weeks.filter((w) => w.predictedChange !== null);
  const measured = weeks.filter((w) => w.change !== null);
  const actualChange = measured.length ? measured.reduce((sum, w) => sum + w.change!, 0) : null;
  return { predictedChange: predicted.length ? predicted.reduce((sum, w) => sum + w.predictedChange!, 0) : null,
    actualChange, averageChange: actualChange === null ? null : actualChange / measured.length,
    measuredWeeks: measured.length, predictedWeeks: predicted.length };
}

export type NutritionColumn = 'weight' | 'intake' | 'output';
export type NutritionCellEdit = { date: string; column: NutritionColumn; text: string };
export type NutritionEntryPlan = { row_date: string; kind: 'weight' | 'nutrition'; value: Record<string, unknown>; expected_version: number };
/** Validates the complete edit batch before creating any write. Related calorie fields save once. */
export function planNutritionCells(weeks: NutritionWeek[], edits: NutritionCellEdit[], today: string): NutritionEntryPlan[] {
  const groups = new Map<string, NutritionEntryPlan>();
  const rows = weeks.flatMap((week) => week.rows);
  for (const edit of edits) {
    const row = rows.find((r) => r.date === edit.date);
    const unit = weeks.find((week) => week.rows.some((r) => r.date === edit.date))?.unit ?? 'lb';
    if (!row || row.date > today) throw new Error('Choose an existing program date up to today.');
    const value = edit.text.trim() === '' ? null : Number(edit.text);
    const weight = edit.column === 'weight';
    if (weight && value === null && row.weight?.weight == null) continue;
    if (weight ? value !== null && (!Number.isFinite(value) || value <= 0 || value > 1500)
      : value !== null && (!Number.isInteger(value) || value < 0 || value > 30000)) {
      throw new Error(weight ? `${edit.date}: enter a weight greater than 0 and at most 1,500 ${unit}.` : `${edit.date}: calories must be whole numbers from 0 to 30,000; leave unknown values blank.`);
    }
    const key = `${edit.date}:${weight ? 'weight' : 'nutrition'}`;
    const planned = groups.get(key) ?? { row_date: edit.date, kind: weight ? 'weight' : 'nutrition',
      expected_version: (weight ? row.weight : row.entry)?.version ?? 0,
      value: weight ? { weight: value, unit } : { intake: row.entry?.intake ?? null, output: row.entry?.output ?? null, notes: row.entry?.notes ?? '' } };
    planned.value[edit.column] = value;
    groups.set(key, planned);
  }
  return [...groups.values()];
}
