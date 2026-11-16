import { z } from 'zod';
import { NumericRange } from './range';

/** Units are never inferred from a bare number (PRD §10). `null` means "not yet known". */
export const WeightUnit = z.enum(['lb', 'kg']);
export type WeightUnit = z.infer<typeof WeightUnit>;

/**
 * How a set is loaded. Bodyweight, assistance and bands are distinct modes so they never
 * become a lifted-weight number in charts (FR-07, FR-10).
 */
/** Loads are never negative; assistance is its own mode with a positive amount. */
const LoadRange = NumericRange.refine((r) => r.min >= 0, { message: 'Load cannot be negative' });

export const Load = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('external'), value: LoadRange, unit: WeightUnit.nullable() }),
  z.object({ mode: z.literal('bodyweight'), added: z.object({ value: z.number().min(0, 'Load cannot be negative'), unit: WeightUnit.nullable() }).nullable() }),
  z.object({ mode: z.literal('assisted'), value: LoadRange, unit: WeightUnit.nullable() }),
  z.object({ mode: z.literal('band'), label: z.string().min(1) }),
  z.object({ mode: z.literal('not_applicable') }),
]);
export type Load = z.infer<typeof Load>;

/** Rep or time target. Decimal reps are allowed (sample data contains 8.5 and 10.5). */
export const Effort = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('reps'), reps: NumericRange, perSide: z.boolean() }),
  z.object({ kind: z.literal('duration'), seconds: NumericRange, perSide: z.boolean() }),
]);
export type Effort = z.infer<typeof Effort>;

const LB_PER_KG = 2.2046226218;

/** Explicit conversion only; callers must already know the source unit. */
export function convertWeight(value: number, from: WeightUnit, to: WeightUnit): number {
  if (from === to) return value;
  return from === 'kg' ? value * LB_PER_KG : value / LB_PER_KG;
}
