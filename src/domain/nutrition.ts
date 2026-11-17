import { z } from 'zod';

export const NutritionTargetInput = z.object({
  style: z.string().trim().min(1, 'Enter a program style').max(160),
  starts_on: z.iso.date(), ends_on: z.iso.date().nullable(),
  calorie_goal: z.number().int().min(0).max(30000),
  maintenance: z.number().int().min(0).max(30000).nullable(),
  baseline_weight: z.number().positive().max(1500).nullable(),
  weight_unit: z.enum(['lb', 'kg']),
  notes: z.string().max(5000),
}).refine((v) => !v.ends_on || v.ends_on >= v.starts_on, { message: 'End date must follow the start date', path: ['ends_on'] });
export type NutritionTargetInput = z.infer<typeof NutritionTargetInput>;
export const NutritionTarget = NutritionTargetInput.and(z.object({ id: z.string(), created_at: z.string() }));
export type NutritionTarget = z.infer<typeof NutritionTarget>;
const attribution = { version: z.number().int(), updated_at: z.string(), updated_by_staff: z.boolean() };
export const WeighIn = z.object({ measured_on: z.iso.date(), weight: z.number().nullable(), unit: z.enum(['lb', 'kg']), ...attribution });
export type WeighIn = z.infer<typeof WeighIn>;
export const NutritionEntry = z.object({ activity_on: z.iso.date(), intake: z.number().nullable(), output: z.number().nullable(), notes: z.string(),
  intake_updated_by_staff: z.boolean().optional(), output_updated_by_staff: z.boolean().optional(), ...attribution });
export type NutritionEntry = z.infer<typeof NutritionEntry>;
export const NutritionData = z.object({
  client_id: z.string(), client_name: z.string(), timezone: z.string(), today: z.iso.date(),
  from: z.iso.date(), through: z.iso.date(), can_assign: z.boolean(), can_log: z.boolean(),
  targets: z.array(NutritionTarget), weights: z.array(WeighIn), entries: z.array(NutritionEntry),
  changes: z.array(z.object({ id: z.string(), kind: z.enum(['weight', 'nutrition']), entry_date: z.iso.date(),
    created_at: z.string(), by_staff: z.boolean(), before_value: z.unknown(), after_value: z.unknown() })),
});
export type NutritionData = z.infer<typeof NutritionData>;

/** Calendar arithmetic uses UTC dates, independent of browser zone and DST. */
export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function monday(date: string): string {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return shiftDate(date, -(day === 0 ? 6 : day - 1));
}
export function targetOn(targets: NutritionTarget[], date: string): NutritionTarget | undefined {
  // A later version supersedes earlier versions even if the new version has since ended.
  const latest = targets.filter((t) => t.starts_on <= date).sort((a, b) => b.starts_on.localeCompare(a.starts_on))[0];
  return latest && (!latest.ends_on || latest.ends_on >= date) ? latest : undefined;
}
export function convertWeight(value: number, from: 'lb' | 'kg', to: 'lb' | 'kg'): number {
  return from === to ? value : from === 'lb' ? value * 0.45359237 : value / 0.45359237;
}
export function weightAverage(weights: WeighIn[], from: string, through: string, unit: 'lb' | 'kg') {
  const rows = weights.filter((w) => w.weight !== null && w.measured_on >= from && w.measured_on <= through);
  return { count: rows.length, average: rows.length >= 3 ? rows.reduce((sum, w) => sum + convertWeight(w.weight!, w.unit, unit), 0) / rows.length : null };
}
export function calorieBalance(entry: Pick<NutritionEntry, 'intake' | 'output'>): number | null {
  return entry.intake === null || entry.output === null ? null : entry.intake - entry.output;
}

export function optionalNumber(value: string): number | null {
  return value.trim() === '' ? null : Number(value);
}
