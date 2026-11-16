import { z } from 'zod';

/**
 * A closed numeric interval. Scalars are stored with equal endpoints, so RIR "2" is {min: 2, max: 2}
 * and RIR "1-2" is {min: 1, max: 2}. Ranges are never dates (PRD decision 6).
 */
export const NumericRange = z
  .object({
    min: z.number().finite(),
    max: z.number().finite(),
  })
  .refine((r) => r.min <= r.max, { message: 'Range minimum must not exceed maximum' });
export type NumericRange = z.infer<typeof NumericRange>;

export function scalar(value: number): NumericRange {
  return { min: value, max: value };
}

export function isScalar(range: NumericRange): boolean {
  return range.min === range.max;
}

export function formatRange(range: NumericRange): string {
  return isScalar(range) ? String(range.min) : `${range.min}-${range.max}`;
}

const NUMBER = String.raw`\d+(?:\.\d+)?`;
const RANGE_TEXT = new RegExp(String.raw`^\s*(${NUMBER})\s*(?:-|–|—|to)\s*(${NUMBER})\s*$`, 'i');
const SCALAR_TEXT = new RegExp(String.raw`^\s*(${NUMBER})\s*$`);

export type RangeParseResult =
  | { ok: true; range: NumericRange }
  | { ok: false; reason: 'empty' | 'unrecognized' | 'inverted' };

/** Parses "2", "1-2", "8.5-9", "2 to 3". Does not accept dates or anything with extra text. */
export function parseRangeText(text: string): RangeParseResult {
  if (text.trim() === '') return { ok: false, reason: 'empty' };
  const r = RANGE_TEXT.exec(text);
  if (r) {
    const min = Number(r[1]);
    const max = Number(r[2]);
    if (min > max) return { ok: false, reason: 'inverted' };
    return { ok: true, range: { min, max } };
  }
  const s = SCALAR_TEXT.exec(text);
  if (s) return { ok: true, range: scalar(Number(s[1])) };
  return { ok: false, reason: 'unrecognized' };
}

/** RIR is non-negative. The operational ceiling is a pending Matt decision (PRD §15.3); 10 is a review threshold, not a hard rule. */
export const RIR_REVIEW_CEILING = 10;

export const RirRange = NumericRange.refine((r) => r.min >= 0, { message: 'RIR cannot be negative' });
export const RpeRange = NumericRange.refine((r) => r.min >= 0 && r.max <= 10, {
  message: 'RPE must be between 0 and 10',
});
