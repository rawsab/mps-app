import { describe, expect, it } from 'vitest';
import {
  addDays,
  columnIndex,
  columnLetters,
  elapsedMinutes,
  fractionToLocalTime,
  isDateFormat,
  isTimeFormat,
  renderDateSerial,
  serialToIsoDate,
} from '@/domain/imports/excel';

describe('spreadsheet primitives', () => {
  it('converts column letters both ways', () => {
    expect(columnIndex('A')).toBe(1);
    expect(columnIndex('AB')).toBe(28);
    expect(columnLetters(28)).toBe('AB');
    expect(columnLetters(702)).toBe('ZZ');
  });

  it('decodes the 1900 and 1904 date systems', () => {
    expect(serialToIsoDate(46024, false)).toBe('2026-01-02');
    expect(serialToIsoDate(46126, false)).toBe('2026-04-14');
    expect(serialToIsoDate(44562, true)).toBe('2026-01-02');
    expect(serialToIsoDate(30, false)).toBeNull(); // pre-leap-bug serials are ambiguous
  });

  it('renders the m-d display that hides a converted RIR range', () => {
    expect(renderDateSerial(46024, 'm-d', false)).toBe('1-2');
    expect(renderDateSerial(46024, 'mm/dd/yyyy', false)).toBe('01/02/2026');
  });

  it('recognizes date and time formats without confusing minutes and months', () => {
    expect(isDateFormat(164, 'm-d')).toBe(true);
    expect(isDateFormat(14, null)).toBe(true);
    expect(isDateFormat(0, null)).toBe(false);
    expect(isDateFormat(165, '0.0"m"')).toBe(false);
    expect(isTimeFormat(20, null)).toBe(true);
    expect(isTimeFormat(166, 'h:mm')).toBe(true);
    expect(isDateFormat(166, 'h:mm')).toBe(false);
  });

  it('converts Excel day fractions with 1,440 minutes per day', () => {
    expect(fractionToLocalTime(0.6145833333333334)).toBe('14:45');
    expect(fractionToLocalTime(0.75)).toBe('18:00');
    expect(fractionToLocalTime(1.2)).toBeNull();
  });

  it('handles sessions that cross midnight', () => {
    expect(elapsedMinutes('14:45', '16:08')).toBe(83);
    expect(elapsedMinutes('23:30', '00:15')).toBe(45);
  });

  it('shifts "day before" activity dates across month boundaries', () => {
    expect(addDays('2026-05-01', -1)).toBe('2026-04-30');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});
