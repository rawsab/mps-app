import { describe, expect, it } from 'vitest';
import { convertWeight } from '@/domain/measurements/load';
import { formatRange, NumericRange, parseRangeText, RirRange, RpeRange } from '@/domain/measurements/range';
import { parseEffort, parseLabelledFields, parseLoad, parseTimedSets } from '@/domain/imports/notation';

describe('numeric ranges', () => {
  it('keeps RIR 1-2 as a range, never a date', () => {
    expect(parseRangeText('1-2')).toEqual({ ok: true, range: { min: 1, max: 2 } });
    expect(formatRange({ min: 1, max: 2 })).toBe('1-2');
  });

  it('stores scalars as equal endpoints', () => {
    expect(parseRangeText('2')).toEqual({ ok: true, range: { min: 2, max: 2 } });
    expect(formatRange({ min: 2, max: 2 })).toBe('2');
  });

  it('accepts decimals and alternative separators', () => {
    expect(parseRangeText('8.5-9')).toEqual({ ok: true, range: { min: 8.5, max: 9 } });
    expect(parseRangeText('2 to 3')).toEqual({ ok: true, range: { min: 2, max: 3 } });
    expect(parseRangeText('2–3')).toEqual({ ok: true, range: { min: 2, max: 3 } });
  });

  it('rejects inverted, empty and date-like text', () => {
    expect(parseRangeText('3-1')).toEqual({ ok: false, reason: 'inverted' });
    expect(parseRangeText('  ')).toEqual({ ok: false, reason: 'empty' });
    expect(parseRangeText('1/2/2026')).toEqual({ ok: false, reason: 'unrecognized' });
    expect(parseRangeText('Jan 2')).toEqual({ ok: false, reason: 'unrecognized' });
  });

  it('validates range invariants in the schema', () => {
    expect(NumericRange.safeParse({ min: 2, max: 1 }).success).toBe(false);
    expect(RirRange.safeParse({ min: -1, max: 1 }).success).toBe(false);
    expect(RpeRange.safeParse({ min: 8, max: 11 }).success).toBe(false);
    expect(RpeRange.safeParse({ min: 8.5, max: 9 }).success).toBe(true);
  });
});

describe('load notation', () => {
  it('never assumes a unit for a bare number', () => {
    const r = parseLoad('450');
    expect(r.load).toEqual({ mode: 'external', value: { min: 450, max: 450 }, unit: null });
    expect(r.unitUnknown).toBe(true);
  });

  it('reads explicit units', () => {
    expect(parseLoad('40lbs').load).toEqual({ mode: 'external', value: { min: 40, max: 40 }, unit: 'lb' });
    expect(parseLoad('20 kg').load).toEqual({ mode: 'external', value: { min: 20, max: 20 }, unit: 'kg' });
  });

  it('splits an annotation from the load instead of discarding it', () => {
    const r = parseLoad('90 ds');
    expect(r.load).toMatchObject({ mode: 'external', value: { min: 90, max: 90 } });
    expect(r.annotation).toBe('ds');
    expect(parseLoad('35lbs (1)').annotation).toBe('(1)');
  });

  it('keeps bodyweight, bands, not-applicable and skipped as distinct states', () => {
    expect(parseLoad('BW').load).toEqual({ mode: 'bodyweight', added: null });
    expect(parseLoad('Blue').load).toEqual({ mode: 'band', label: 'Blue' });
    expect(parseLoad('--').load).toEqual({ mode: 'not_applicable' });
    expect(parseLoad("Didn't do")).toMatchObject({ load: null, skipped: true });
    expect(parseLoad('').load).toBeNull();
  });

  it('flags text it cannot interpret', () => {
    expect(parseLoad('heavy-ish?').recognized).toBe(false);
  });

  it('converts units only when asked', () => {
    expect(convertWeight(100, 'kg', 'lb')).toBeCloseTo(220.462, 2);
    expect(convertWeight(220.462, 'lb', 'kg')).toBeCloseTo(100, 2);
  });
});

describe('effort notation', () => {
  it('reads reps, decimal reps and per-side reps', () => {
    expect(parseEffort('12').effort).toEqual({ kind: 'reps', reps: { min: 12, max: 12 }, perSide: false });
    expect(parseEffort('8.5').effort).toEqual({ kind: 'reps', reps: { min: 8.5, max: 8.5 }, perSide: false });
    expect(parseEffort('15 each leg').effort).toEqual({ kind: 'reps', reps: { min: 15, max: 15 }, perSide: true });
  });

  it('reads durations', () => {
    expect(parseEffort('60 secs').effort).toEqual({ kind: 'duration', seconds: { min: 60, max: 60 }, perSide: false });
    expect(parseEffort('60 secs each side').effort).toEqual({ kind: 'duration', seconds: { min: 60, max: 60 }, perSide: true });
    expect(parseEffort('2 min').effort).toEqual({ kind: 'duration', seconds: { min: 120, max: 120 }, perSide: false });
  });

  it('returns per-set lists for review instead of picking one', () => {
    expect(parseEffort('20, 18')).toEqual({ effort: null, perSetReps: [20, 18], recognized: true });
  });

  it('reads "30 seconds x2" and labelled circuit prescriptions', () => {
    expect(parseTimedSets('30 seconds x2')).toEqual({
      effort: { kind: 'duration', seconds: { min: 30, max: 30 }, perSide: false },
      sets: { min: 2, max: 2 },
    });
    expect(parseLabelledFields('Sets: 1-2    Reps: 15 each leg      Weight: Blue')).toEqual({
      sets: '1-2',
      reps: '15 each leg',
      weight: 'Blue',
    });
  });
});
