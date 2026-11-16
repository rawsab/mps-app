import type { Effort, Load, WeightUnit } from '../measurements/load';
import { parseRangeText, scalar, type NumericRange } from '../measurements/range';

/**
 * Parsers for the notation found in MPS source files. Each returns the interpretation plus
 * anything it could not interpret, so callers can raise review issues instead of guessing.
 */

export type ParsedLoad = {
  load: Load | null;
  /** Text after the number that is not a unit, e.g. "ds" in "90 ds" or "(1)" in "35lbs (1)". */
  annotation: string | null;
  skipped: boolean;
  /** True when a numeric load had no unit evidence. */
  unitUnknown: boolean;
  recognized: boolean;
};

const BAND_COLORS = /^(red|blue|green|black|yellow|purple|orange|grey|gray|pink|light|heavy|medium)(\s+band)?$/i;
const UNIT_TEXT: Record<string, WeightUnit> = { lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb', kg: 'kg', kgs: 'kg', kilo: 'kg', kilos: 'kg' };
const SKIP_TEXT = /^(didn'?t do|did not do|skip(ped)?|n\/?a missed|missed)$/i;
const NA_TEXT = /^(-+|n\/?a|none)$/i;

export function parseLoad(text: string, defaultUnit: WeightUnit | null = null): ParsedLoad {
  const t = text.replace(/\s+/g, ' ').trim();
  const none = { annotation: null, skipped: false, unitUnknown: false };
  if (t === '') return { ...none, load: null, recognized: true };
  if (SKIP_TEXT.test(t)) return { ...none, load: null, skipped: true, recognized: true };
  if (NA_TEXT.test(t)) return { ...none, load: { mode: 'not_applicable' }, recognized: true };
  if (/^(bw|body ?weight)$/i.test(t)) return { ...none, load: { mode: 'bodyweight', added: null }, recognized: true };
  if (BAND_COLORS.test(t)) return { ...none, load: { mode: 'band', label: t }, recognized: true };

  const m = /^(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?\s*([a-z]+)?\.?\s*(.*)$/i.exec(t);
  if (!m) return { ...none, load: null, recognized: false };
  const min = Number(m[1]);
  const max = m[2] ? Number(m[2]) : min;
  if (min > max) return { ...none, load: null, recognized: false };
  const word = m[3]?.toLowerCase();
  let unit: WeightUnit | null = defaultUnit;
  let annotation = (m[4] ?? '').trim();
  if (word && UNIT_TEXT[word]) unit = UNIT_TEXT[word]!;
  else if (word) annotation = `${m[3]} ${annotation}`.trim();
  return {
    load: { mode: 'external', value: { min, max }, unit },
    annotation: annotation || null,
    skipped: false,
    unitUnknown: unit === null,
    recognized: true,
  };
}

export type ParsedEffort = { effort: Effort | null; perSetReps: number[] | null; recognized: boolean };

const PER_SIDE = /\b(each|per)\s+(leg|side|arm)\b/i;
const SECONDS = /^(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?\s*(s|sec|secs|second|seconds)\b/i;
const MINUTES = /^(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?\s*(m|min|mins|minute|minutes)\b/i;

/** Reps or time targets: "12", "8-10", "15 each leg", "60 secs each side", "20, 18". */
export function parseEffort(text: string): ParsedEffort {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t === '' || NA_TEXT.test(t)) return { effort: null, perSetReps: null, recognized: true };
  const perSide = PER_SIDE.test(t);
  const core = t.replace(PER_SIDE, '').trim();

  const sec = SECONDS.exec(core);
  if (sec) {
    return { effort: { kind: 'duration', seconds: { min: Number(sec[1]), max: Number(sec[2] ?? sec[1]) }, perSide }, perSetReps: null, recognized: true };
  }
  const min = MINUTES.exec(core);
  if (min) {
    const lo = Number(min[1]) * 60;
    const hi = Number(min[2] ?? min[1]) * 60;
    return { effort: { kind: 'duration', seconds: { min: lo, max: hi }, perSide }, perSetReps: null, recognized: true };
  }
  if (/^\d+(\.\d+)?(\s*,\s*\d+(\.\d+)?)+$/.test(core)) {
    const reps = core.split(',').map((s) => Number(s.trim()));
    return { effort: null, perSetReps: reps, recognized: true };
  }
  const range = parseRangeText(core);
  if (range.ok) return { effort: { kind: 'reps', reps: range.range, perSide }, perSetReps: null, recognized: true };
  return { effort: null, perSetReps: null, recognized: false };
}

/** "30 seconds x2" → duration 30s and 2 sets. */
export function parseTimedSets(text: string): { effort: Effort; sets: NumericRange } | null {
  const m = /^(.+?)\s*[x×]\s*(\d+)$/i.exec(text.trim());
  if (!m) return null;
  const parsed = parseEffort(m[1]!);
  if (!parsed.effort) return null;
  return { effort: parsed.effort, sets: scalar(Number(m[2])) };
}

/** "Sets: 1-2    Reps: 15 each leg      Weight: Blue" → labelled fields. */
export function parseLabelledFields(text: string): Record<string, string> | null {
  const re = /(sets|reps|weight|load|rpe|rir|time)\s*:\s*/gi;
  const matches = [...text.matchAll(re)];
  if (matches.length === 0) return null;
  const out: Record<string, string> = {};
  matches.forEach((m, i) => {
    const start = m.index! + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1]!.index! : text.length;
    out[m[1]!.toLowerCase()] = text.slice(start, end).trim();
  });
  const leading = text.slice(0, matches[0]!.index!).trim();
  if (leading) out['_leading'] = leading;
  return out;
}

/** Exercise names that offer a choice: trailing "or" continues on the next row; inline "A or B". */
export function alternativeShape(name: string): 'continues_next' | 'inline' | null {
  if (/\s+or\s*$/i.test(name)) return 'continues_next';
  if (/\s+or\s+/i.test(name)) return 'inline';
  return null;
}

export function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';
}
